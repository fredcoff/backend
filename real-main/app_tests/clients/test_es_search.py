import pytest
import requests_mock

from app.clients import ESSearchClient

# the requests_mock parameter is auto-supplied, no need to even import the
# requests-mock library # https://requests-mock.readthedocs.io/en/latest/pytest.html


@pytest.fixture
def elasticsearch_client():
    yield ESSearchClient(domain='real.es.amazonaws.com')


def test_build_user_url(elasticsearch_client):
    user_id = 'my-user-id'
    assert elasticsearch_client.build_user_url(user_id) == 'https://real.es.amazonaws.com/users/_doc/my-user-id'


def test_build_user_document_minimal(elasticsearch_client):
    dynamo_user_doc = {
        'sortKey': 'profile',
        'partitionKey': 'user/us-east-1:088d2841-7089-4136-88a0-8aa3e5ae9ce1',
        'privacyStatus': 'PUBLIC',
        'userId': 'us-east-1:088d2841-7089-4136-88a0-8aa3e5ae9ce1',
        'username': 'TESTER-gotSOMEcaseotxxie',
    }
    expected_user_doc = {
        'userId': 'us-east-1:088d2841-7089-4136-88a0-8aa3e5ae9ce1',
        'username': 'TESTER-gotSOMEcaseotxxie',
    }
    assert elasticsearch_client.build_user_doc(dynamo_user_doc) == expected_user_doc


def test_build_user_document_maximal(elasticsearch_client):
    dynamo_user_doc = {
        'phoneNumber': '+14155551212',
        'sortKey': 'profile',
        'partitionKey': 'user/us-east-1:bca9f0ae-76e4-4ac9-a750-c691cbda505b',
        'privacyStatus': 'PUBLIC',
        'userId': 'us-east-1:bca9f0ae-76e4-4ac9-a750-c691cbda505b',
        'email': 'success@simulator.amazonses.com',
        'username': 'TESTER-o7jow8',
        'fullName': 'Joe Shmoe',
        'bio': 'Staying classy, just like San Diego',
        'photoPath': 'somewhere/good',
        'followerCount': 42,
        'followedCount': 54,
        'postCount': 10,
    }
    expected_user_doc = {
        'userId': 'us-east-1:bca9f0ae-76e4-4ac9-a750-c691cbda505b',
        'username': 'TESTER-o7jow8',
        'fullName': 'Joe Shmoe',
    }
    assert elasticsearch_client.build_user_doc(dynamo_user_doc) == expected_user_doc


def test_add_user(elasticsearch_client, monkeypatch):
    monkeypatch.setenv('AWS_ACCESS_KEY_ID', 'foo')
    monkeypatch.setenv('AWS_SECRET_ACCESS_KEY', 'bar')

    dynamo_user_doc = {
        'userId': 'us-east-1:088d2841-7089-4136-88a0-8aa3e5ae9ce1',
        'username': 'TESTER-gotSOMEcaseotxxie',
    }
    doc = elasticsearch_client.build_user_doc(dynamo_user_doc)
    url = elasticsearch_client.build_user_url(doc['userId'])

    with requests_mock.mock() as m:
        m.put(url, None)
        elasticsearch_client.add_user(dynamo_user_doc)

    assert len(m.request_history) == 1
    assert m.request_history[0].method == 'PUT'
    assert m.request_history[0].json() == doc


def test_update_user(elasticsearch_client, monkeypatch):
    monkeypatch.setenv('AWS_ACCESS_KEY_ID', 'foo')
    monkeypatch.setenv('AWS_SECRET_ACCESS_KEY', 'bar')

    old_dynamo_user_doc = {
        'userId': 'us-east-1:088d2841-7089-4136-88a0-8aa3e5ae9ce1',
        'username': 'something-else',
    }
    new_dynamo_user_doc = {
        'userId': 'us-east-1:088d2841-7089-4136-88a0-8aa3e5ae9ce1',
        'username': 'TESTER-gotSOMEcaseotxxie',
    }
    new_doc = elasticsearch_client.build_user_doc(new_dynamo_user_doc)
    url = elasticsearch_client.build_user_url(new_doc['userId'])

    with requests_mock.mock() as m:
        m.put(url, None)
        elasticsearch_client.update_user(old_dynamo_user_doc, new_dynamo_user_doc)

    assert len(m.request_history) == 1
    assert m.request_history[0].method == 'PUT'
    assert m.request_history[0].json() == new_doc


def test_delete_user(elasticsearch_client, monkeypatch):
    monkeypatch.setenv('AWS_ACCESS_KEY_ID', 'foo')
    monkeypatch.setenv('AWS_SECRET_ACCESS_KEY', 'bar')

    dynamo_user_doc = {
        'userId': 'us-east-1:088d2841-7089-4136-88a0-8aa3e5ae9ce1',
        'username': 'meh',
    }
    doc = elasticsearch_client.build_user_doc(dynamo_user_doc)
    url = elasticsearch_client.build_user_url(doc['userId'])

    with requests_mock.mock() as m:
        m.delete(url, None)
        elasticsearch_client.delete_user(dynamo_user_doc)

    assert len(m.request_history) == 1
    assert m.request_history[0].method == 'DELETE'


def test_updates_without_change_in_index_fields_dont_get_sent_to_elasticsearch(elasticsearch_client):
    old_dynamo_user_doc = {
        'userId': 'us-east-1:088d2841-7089-4136-88a0-8aa3e5ae9ce1',
        'username': 'same-thing',
    }
    new_dynamo_user_doc = {
        'userId': 'us-east-1:088d2841-7089-4136-88a0-8aa3e5ae9ce1',
        'username': 'same-thing',
    }
    with requests_mock.mock() as m:
        elasticsearch_client.update_user(old_dynamo_user_doc, new_dynamo_user_doc)
    assert len(m.request_history) == 0
