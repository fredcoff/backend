const dotenv = require('dotenv')
const rp = require('request-promise-native')
const uuidv4 = require('uuid/v4')

const cognito = require('../../utils/cognito')
jest.retryTimes(2)

dotenv.config()

const api_key = process.env.REAL_AUTH_API_KEY
if (api_key === undefined) throw new Error('Env var REAL_AUTH_API_KEY must be defined')

const api_root = process.env.REAL_AUTH_API_ROOT
if (api_root === undefined) throw new Error('Env var REAL_AUTH_API_ROOT must be defined')

const generateRandomUserId = () => 'us-east-1:' + uuidv4()
const generateRandomConfirmationCode = () => Math.random().toString().substring(2, 8)

const uri = api_root + '/user/confirm'
const headers = {'x-api-key': api_key}

test('Cant confirm user that does not exist', async () => {
  const qs = {userId: generateRandomUserId(), code: generateRandomConfirmationCode()}
  await expect(rp.post({uri, headers, qs})).rejects.toThrow(/400 - .*User confirmation failed/)
})

test('Cant confirm user with wrong confirmation code', async () => {
  const userId = generateRandomUserId()
  const password = cognito.generatePassword()
  const email = cognito.generateEmail()

  // signup a user but don't confirm them
  await cognito.userPoolClient
    .signUp({
      Username: userId,
      Password: password,
      UserAttributes: [
        {
          Name: 'family_name',
          Value: cognito.familyName,
        },
        {
          Name: 'email',
          Value: email,
        },
      ],
    })
    .promise()

  const qs = {userId, code: generateRandomConfirmationCode()}
  await expect(rp.post({uri, headers, qs})).rejects.toThrow(/400 - .*User confirmation failed/)
})

test.skip('Confirm user success', async () => {
  // no way to test this without recieving a confirmation code sent to an email addr or phone number
  // use the scripts provided in the 'scripts' dir to test this manually
})
