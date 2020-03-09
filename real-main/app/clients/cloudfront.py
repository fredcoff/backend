import base64
import json
import os
import urllib

from botocore.signers import CloudFrontSigner
from cryptography.hazmat.backends import default_backend
from cryptography.hazmat.primitives import hashes
from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.asymmetric import padding
import pendulum

CLOUDFRONT_DOMAIN = os.environ.get('CLOUDFRONT_DOMAIN')


class CloudFrontClient:

    def __init__(self, key_pair_getter, domain=CLOUDFRONT_DOMAIN):
        assert domain, "CloudFront domain is required"
        self.domain = domain
        self.key_pair_getter = key_pair_getter

    def get_key_pair(self):
        if not hasattr(self, '_key_pair'):
            self._key_pair = self.key_pair_getter()
        return self._key_pair

    def get_private_key(self):
        "A PrivateKey object ready to use to .sign()"
        if not hasattr(self, '_private_key'):
            private_key = self.get_key_pair()['privateKey']

            # the private key format requires newlines after the header and before the footer
            # and the secrets manager doesn't seem to play well with newlines
            pk_string = f"-----BEGIN RSA PRIVATE KEY-----\n{private_key}\n-----END RSA PRIVATE KEY-----"
            pk_bytes = bytearray(pk_string, 'utf-8')
            self._private_key = serialization.load_pem_private_key(pk_bytes, password=None, backend=default_backend())
        return self._private_key

    def get_cloudfront_signer(self):
        if not hasattr(self, '_cfsigner'):
            key_id = self.get_key_pair()['keyId']
            pk = self.get_private_key()
            self._cfsigner = CloudFrontSigner(key_id, lambda msg: pk.sign(msg, padding.PKCS1v15(), hashes.SHA1()))
        return self._cfsigner

    def generate_unsigned_url(self, path):
        return f'https://{self.domain}/{path}'

    def generate_presigned_url(self, path, methods, expires_at=None):
        # https://boto3.amazonaws.com/v1/documentation/api/latest/reference/services/cloudfront.html#examples
        expires_at = expires_at or pendulum.now('utc') + pendulum.duration(hours=1)
        qs = urllib.parse.urlencode([('Method', m) for m in methods])
        url = f'https://{self.domain}/{path}?{qs}'
        return self.get_cloudfront_signer().generate_presigned_url(url, date_less_than=expires_at)

    def generate_presigned_cookies(self, path, expires_at=None):
        # https://gist.github.com/mjohnsullivan/31064b04707923f82484c54981e4749e
        expires_at = expires_at or pendulum.now('utc') + pendulum.duration(hours=1)
        url = self.generate_unsigned_url(path)
        policy = self.generate_cookie_policy(url, expires_at)
        signature = self.get_private_key().sign(policy, padding.PKCS1v15(), hashes.SHA1())
        return {
            'CloudFront-Policy': self._encode(policy),
            'CloudFront-Signature': self._encode(signature),
            'CloudFront-Key-Pair-Id': self.get_key_pair()['keyId'],
        }

    def generate_cookie_policy(self, path, expires_at):
        policy_dict = {
            'Statement': [{
                'Resource': path,
                'Condition': {
                    'DateLessThan': {
                        'AWS:EpochTime': expires_at.int_timestamp
                    }
                }
            }]
        }
        # Using separators=(',', ':') removes seperator whitespace
        return json.dumps(policy_dict, separators=(',', ':')).encode('utf-8')

    def _encode(self, msg):
        "Base64 encode and replace unsupported chars: '+=/' with '-_~'"
        msg_b64 = str(base64.b64encode(msg), 'utf-8')
        return msg_b64.replace('+', '-').replace('=', '_').replace('/', '~')
