/* eslint-env jest */

const uuidv4 = require('uuid/v4')

const cognito = require('../../utils/cognito.js')
const { mutations } = require('../../schema')

const loginCache = new cognito.AppSyncLoginCache()

beforeAll(async () => {
  loginCache.addCleanLogin(await cognito.getAppSyncLogin())
})

beforeEach(async () => await loginCache.clean())
afterAll(async () => await loginCache.clean())


test('Add video post failures', async () => {
  const [ourClient] = await loginCache.getCleanLogin()

  // verify can't use setAsUserPhoto with video posts
  let variables = {postId: uuidv4(), postType: 'VIDEO', setAsUserPhoto: true}
  await expect(ourClient.mutate({mutation: mutations.addPost, variables}))
    .rejects.toThrow(/ClientError: Cannot .* with setAsUserPhoto$/)

  // verify can't use image_input with video posts
  variables = {postId: uuidv4(), postType: 'VIDEO', takenInReal: true}
  await expect(ourClient.mutate({mutation: mutations.addPost, variables}))
    .rejects.toThrow(/ClientError: Cannot .* with ImageInput$/)

})


test('Add pending video post minimal', async () => {
  const [ourClient] = await loginCache.getCleanLogin()

  const postId = uuidv4()
  let variables = {postId, postType: 'VIDEO'}
  let resp = await ourClient.mutate({mutation: mutations.addPost, variables})
  expect(resp.errors).toBeUndefined()
  expect(resp.data.addPost.postId).toBe(postId)
  expect(resp.data.addPost.postType).toBe('VIDEO')
  expect(resp.data.addPost.postStatus).toBe('PENDING')
  expect(resp.data.addPost.videoUploadUrl).toBeTruthy()
  expect(resp.data.addPost.text).toBeNull()
  expect(resp.data.addPost.isVerified).toBeNull()
  expect(resp.data.addPost.image).toBeNull()
  expect(resp.data.addPost.imageUploadUrl).toBeNull()
  expect(resp.data.addPost.commentsDisabled).toBe(false)
  expect(resp.data.addPost.likesDisabled).toBe(false)
  expect(resp.data.addPost.sharingDisabled).toBe(false)
  expect(resp.data.addPost.verificationHidden).toBe(false)
})


test('Add pending video post maximal', async () => {
  const [ourClient] = await loginCache.getCleanLogin()

  const postId = uuidv4()
  const text = 'lore ipsum'
  let variables = {
    postId,
    postType: 'VIDEO',
    text,
    commentsDisabled: true,
    likesDisabled: true,
    sharingDisabled: true,
    verificationHidden: true,
  }
  let resp = await ourClient.mutate({mutation: mutations.addPost, variables})
  expect(resp.errors).toBeUndefined()
  expect(resp.data.addPost.postId).toBe(postId)
  expect(resp.data.addPost.postType).toBe('VIDEO')
  expect(resp.data.addPost.postStatus).toBe('PENDING')
  expect(resp.data.addPost.videoUploadUrl).toBeTruthy()
  expect(resp.data.addPost.text).toBe(text)
  expect(resp.data.addPost.isVerified).toBe(true)
  expect(resp.data.addPost.image).toBeNull()
  expect(resp.data.addPost.imageUploadUrl).toBeNull()
  expect(resp.data.addPost.commentsDisabled).toBe(true)
  expect(resp.data.addPost.likesDisabled).toBe(true)
  expect(resp.data.addPost.sharingDisabled).toBe(true)
  expect(resp.data.addPost.verificationHidden).toBe(true)
})