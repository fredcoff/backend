/* eslint-env jest */

const fs = require('fs')
const path = require('path')
const uuidv4 = require('uuid/v4')

const cognito = require('../../utils/cognito.js')
const schema = require('../../utils/schema.js')

const imageBytes = fs.readFileSync(path.join(__dirname, '..', '..', 'fixtures', 'grant.jpg'))
const imageData = new Buffer.from(imageBytes).toString('base64')

const loginCache = new cognito.AppSyncLoginCache()

beforeAll(async () => {
  loginCache.addCleanLogin(await cognito.getAppSyncLogin())
  loginCache.addCleanLogin(await cognito.getAppSyncLogin())
  loginCache.addCleanLogin(await cognito.getAppSyncLogin())
})

beforeEach(async () => await loginCache.clean())
afterAll(async () => await loginCache.clean())


test('Edit post', async () => {
  // we create an image post
  const [ourClient] = await loginCache.getCleanLogin()
  const [postId, mediaId] = [uuidv4(), uuidv4()]
  let resp = await ourClient.mutate({mutation: schema.addPost, variables: {postId, mediaId, imageData}})
  expect(resp['errors']).toBeUndefined()
  expect(resp['data']['addPost']['postId']).toBe(postId)
  expect(resp['data']['addPost']['postStatus']).toBe('COMPLETED')
  expect(resp['data']['addPost']['image']).toBeTruthy()

  // verify it has no text
  resp = await ourClient.query({query: schema.post, variables: {postId}})
  expect(resp['errors']).toBeUndefined()
  expect(resp['data']['post']['text']).toBeNull()

  // change it to have some text
  const text = 'I have a voice!'
  resp = await ourClient.mutate({mutation: schema.editPost, variables: {postId, text}})
  expect(resp['errors']).toBeUndefined()
  expect(resp['data']['editPost']['text']).toBe(text)
  resp = await ourClient.query({query: schema.post, variables: {postId}})
  expect(resp['errors']).toBeUndefined()
  expect(resp['data']['post']['text']).toBe(text)

  // go back to no text
  resp = await ourClient.mutate({mutation: schema.editPost, variables: {postId, text: ''}})
  expect(resp['errors']).toBeUndefined()
  expect(resp['data']['editPost']['text']).toBeNull()
  resp = await ourClient.query({query: schema.post, variables: {postId}})
  expect(resp['errors']).toBeUndefined()
  expect(resp['data']['post']['text']).toBeNull()
})


test('Edit post failures for for various scenarios', async () => {
  const [ourClient] = await loginCache.getCleanLogin()
  const postId = uuidv4()

  // verify we can't edit a post that doesn't exist
  await expect(ourClient.mutate({
    mutation: schema.editPost,
    variables: {postId, text: 'keep calm'},
  })).rejects.toThrow('does not exist')

  // we add a post
  let resp = await ourClient.mutate({mutation: schema.addPost, variables: {postId, mediaId: uuidv4()}})
  expect(resp['errors']).toBeUndefined()
  expect(resp['data']['addPost']['postStatus']).toBe('PENDING')

  // verify we can't give it a content-less edit
  await expect(ourClient.mutate({
    mutation: schema.editPost,
    variables: {postId}
  })).rejects.toThrow('Empty edit requested')

  // verify another user can't edit it
  const [theirClient] = await loginCache.getCleanLogin()
  await expect(theirClient.mutate({
    mutation: schema.editPost,
    variables: {postId, text: 'go'},
  })).rejects.toThrow("another User's post")

  // verify we can edit it!
  const text = 'stop'
  resp = await ourClient.mutate({mutation: schema.editPost, variables: {postId, text}})
  expect(resp['errors']).toBeUndefined()
  expect(resp['data']['editPost']['text']).toBe(text)
})


test('Edit post edits the copies of posts in followers feeds', async () => {
  const [ourClient, ourUserId] = await loginCache.getCleanLogin()

  // a user that follows us
  const [theirClient] = await loginCache.getCleanLogin()
  let resp = await theirClient.mutate({mutation: schema.followUser, variables: {userId: ourUserId}})
  expect(resp['errors']).toBeUndefined()
  expect(resp['data']['followUser']['followedStatus']).toBe('FOLLOWING')

  // we add a post
  const postId = uuidv4()
  const postText = 'je suis le possion?'
  let variables = {postId, mediaId: uuidv4(), text: postText, imageData}
  resp = await ourClient.mutate({mutation: schema.addPost, variables})
  expect(resp['errors']).toBeUndefined()
  expect(resp['data']['addPost']['postStatus']).toBe('COMPLETED')

  // check that post text in their feed
  resp = await theirClient.query({query: schema.selfFeed})
  expect(resp['data']['self']['feed']['items']).toHaveLength(1)
  expect(resp['data']['self']['feed']['items'][0]['postId']).toBe(postId)
  expect(resp['data']['self']['feed']['items'][0]['text']).toBe(postText)

  // edit the post
  const newText = 'no, vous est le fromage!'
  resp = await ourClient.mutate({mutation: schema.editPost, variables: {postId, text: newText}})
  expect(resp['errors']).toBeUndefined()
  expect(resp['data']['editPost']['text']).toBe(newText)

  // check that post text in their feed was edited
  resp = await theirClient.query({query: schema.selfFeed})
  expect(resp['data']['self']['feed']['items']).toHaveLength(1)
  expect(resp['data']['self']['feed']['items'][0]['postId']).toBe(postId)
  expect(resp['data']['self']['feed']['items'][0]['text']).toBe(newText)
})


test('Disable comments causes existing comments to disappear, then reappear when comments re-enabled', async () => {
  const [ourClient] = await loginCache.getCleanLogin()
  const postId = uuidv4()

  // we add a post
  let variables = {postId, mediaId: uuidv4(), imageData}
  let resp = await ourClient.mutate({mutation: schema.addPost, variables})
  expect(resp['errors']).toBeUndefined()
  expect(resp['data']['addPost']['postStatus']).toBe('COMPLETED')
  expect(resp['data']['addPost']['commentsDisabled']).toBe(false)

  // we add a comment to that post
  const commentId = uuidv4()
  variables = {commentId, postId, text: 'lore'}
  resp = await ourClient.mutate({mutation: schema.addComment, variables})
  expect(resp['errors']).toBeUndefined()
  expect(resp['data']['addComment']['commentId']).toBe(commentId)

  // check we see the comment
  resp = await ourClient.query({query: schema.post, variables: {postId}})
  expect(resp['errors']).toBeUndefined()
  expect(resp['data']['post']['commentsDisabled']).toBe(false)
  expect(resp['data']['post']['commentCount']).toBe(1)
  expect(resp['data']['post']['comments']['items']).toHaveLength(1)
  expect(resp['data']['post']['comments']['items'][0]['commentId']).toBe(commentId)

  // disable comments on the post
  resp = await ourClient.mutate({mutation: schema.editPost, variables: {postId, commentsDisabled: true}})
  expect(resp['errors']).toBeUndefined()
  expect(resp['data']['editPost']['commentsDisabled']).toBe(true)

  // check that comment has disappeared
  resp = await ourClient.query({query: schema.post, variables: {postId}})
  expect(resp['errors']).toBeUndefined()
  expect(resp['data']['post']['commentsDisabled']).toBe(true)
  expect(resp['data']['post']['commentCount']).toBeNull()
  expect(resp['data']['post']['comments']).toBeNull()

  // re-enable comments on the post
  resp = await ourClient.mutate({mutation: schema.editPost, variables: {postId, commentsDisabled: false}})
  expect(resp['errors']).toBeUndefined()
  expect(resp['data']['editPost']['commentsDisabled']).toBe(false)

  // check that comment has re-appeared
  resp = await ourClient.query({query: schema.post, variables: {postId}})
  expect(resp['errors']).toBeUndefined()
  expect(resp['data']['post']['commentsDisabled']).toBe(false)
  expect(resp['data']['post']['commentCount']).toBe(1)
  expect(resp['data']['post']['comments']['items']).toHaveLength(1)
  expect(resp['data']['post']['comments']['items'][0]['commentId']).toBe(commentId)
})


test('Edit post set likesDisabled', async () => {
  const [ourClient] = await loginCache.getCleanLogin()
  const postId = uuidv4()

  // we add a post
  let resp = await ourClient.mutate({mutation: schema.addPost, variables: {postId, mediaId: uuidv4()}})
  expect(resp['errors']).toBeUndefined()
  expect(resp['data']['addPost']['postStatus']).toBe('PENDING')
  expect(resp['data']['addPost']['likesDisabled']).toBe(false)

  // edit the likes disabled status
  resp = await ourClient.mutate({mutation: schema.editPost, variables: {postId, likesDisabled: true}})
  expect(resp['errors']).toBeUndefined()
  expect(resp['data']['editPost']['likesDisabled']).toBe(true)

  // check it saved to db
  resp = await ourClient.query({query: schema.post, variables: {postId}})
  expect(resp['errors']).toBeUndefined()
  expect(resp['data']['post']['likesDisabled']).toBe(true)

  // edit the likes disabled status
  resp = await ourClient.mutate({mutation: schema.editPost, variables: {postId, likesDisabled: false}})
  expect(resp['errors']).toBeUndefined()
  expect(resp['data']['editPost']['likesDisabled']).toBe(false)
})


test('Edit post set sharingDisabled', async () => {
  const [ourClient] = await loginCache.getCleanLogin()
  const postId = uuidv4()

  // we add a post
  let resp = await ourClient.mutate({mutation: schema.addPost, variables: {postId, mediaId: uuidv4()}})
  expect(resp['errors']).toBeUndefined()
  expect(resp['data']['addPost']['postStatus']).toBe('PENDING')
  expect(resp['data']['addPost']['sharingDisabled']).toBe(false)

  // edit the sharing disabled status
  resp = await ourClient.mutate({mutation: schema.editPost, variables: {postId, sharingDisabled: true}})
  expect(resp['errors']).toBeUndefined()
  expect(resp['data']['editPost']['sharingDisabled']).toBe(true)

  // check it saved to db
  resp = await ourClient.query({query: schema.post, variables: {postId}})
  expect(resp['errors']).toBeUndefined()
  expect(resp['data']['post']['sharingDisabled']).toBe(true)

  // edit the sharing disabled status
  resp = await ourClient.mutate({mutation: schema.editPost, variables: {postId, sharingDisabled: false}})
  expect(resp['errors']).toBeUndefined()
  expect(resp['data']['editPost']['sharingDisabled']).toBe(false)
})


test('Edit post set verificationHidden', async () => {
  const [ourClient] = await loginCache.getCleanLogin()
  const postId = uuidv4()

  // we add a post
  let resp = await ourClient.mutate({mutation: schema.addPost, variables: {postId, mediaId: uuidv4()}})
  expect(resp['errors']).toBeUndefined()
  expect(resp['data']['addPost']['postStatus']).toBe('PENDING')
  expect(resp['data']['addPost']['verificationHidden']).toBe(false)

  // edit the verification disabled status
  resp = await ourClient.mutate({mutation: schema.editPost, variables: {postId, verificationHidden: true}})
  expect(resp['errors']).toBeUndefined()
  expect(resp['data']['editPost']['verificationHidden']).toBe(true)

  // check it saved to db
  resp = await ourClient.query({query: schema.post, variables: {postId}})
  expect(resp['errors']).toBeUndefined()
  expect(resp['data']['post']['verificationHidden']).toBe(true)

  // edit the verification disabled status
  resp = await ourClient.mutate({mutation: schema.editPost, variables: {postId, verificationHidden: false}})
  expect(resp['errors']).toBeUndefined()
  expect(resp['data']['editPost']['verificationHidden']).toBe(false)
})


test('Edit post text ensure textTagged users is rewritten', async () => {
  const [ourClient] = await loginCache.getCleanLogin()
  const [theirClient, theirUserId, , , theirUsername] = await loginCache.getCleanLogin()
  const [, otherUserId, , , otherUsername] = await loginCache.getCleanLogin()

  // we add a post a tag
  let postId = uuidv4()
  let text = `hi @${theirUsername}!`
  let resp = await ourClient.mutate({mutation: schema.addPost, variables: {postId, mediaId: uuidv4(), text}})
  expect(resp['errors']).toBeUndefined()
  expect(resp['data']['addPost']['text']).toBe(text)
  expect(resp['data']['addPost']['textTaggedUsers']).toHaveLength(1)
  expect(resp['data']['addPost']['textTaggedUsers'][0]['tag']).toBe(`@${theirUsername}`)
  expect(resp['data']['addPost']['textTaggedUsers'][0]['user']['userId']).toBe(theirUserId)
  expect(resp['data']['addPost']['textTaggedUsers'][0]['user']['username']).toBe(theirUsername)

  // they change their username
  const theirNewUsername = theirUsername.split('').reverse().join('')
  resp = await theirClient.mutate({mutation: schema.setUsername, variables: {username: theirNewUsername}})
  expect(resp['errors']).toBeUndefined()
  expect(resp['data']['setUserDetails']['username']).toBe(theirNewUsername)

  // we edit the post, using their *old* username and a new user's
  // should rewrite the tags to a whole new set
  let newText = `hi @${theirUsername}! say hi to @${otherUsername}`
  resp = await ourClient.mutate({mutation: schema.editPost, variables: {postId, text: newText}})
  expect(resp['errors']).toBeUndefined()
  expect(resp['data']['editPost']['text']).toBe(newText)
  expect(resp['data']['editPost']['textTaggedUsers']).toHaveLength(1)
  expect(resp['data']['editPost']['textTaggedUsers'][0]['tag']).toBe(`@${otherUsername}`)
  expect(resp['data']['editPost']['textTaggedUsers'][0]['user']['userId']).toBe(otherUserId)
  expect(resp['data']['editPost']['textTaggedUsers'][0]['user']['username']).toBe(otherUsername)
})
