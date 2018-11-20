import 'mocha'
import * as sinon from 'sinon'
import * as Chai from 'chai'
import * as chaiAsPromised from 'chai-as-promised'
import { TransportError, MessagePayload, FrameContentType, GrpcTransportServer, GrpcTransport, createConnection } from '../lib'
import createLogger from 'ilp-logger'
const log = createLogger('ilp-protocol-btp')
Chai.use(chaiAsPromised)
const assert = Object.assign(Chai.assert, sinon.assert)

describe('Real connection', () => {

  let server: GrpcTransportServer

  beforeEach(async () => {

    server = new GrpcTransportServer({}, { log: log }).on('connection', (connection: GrpcTransport) => {
      connection.on('request', (message: MessagePayload, replyCallback: (reply: MessagePayload | TransportError | Promise<MessagePayload | TransportError>) => void) => {
        replyCallback(new Promise((respond) => {
          setTimeout(() => {
            respond({
              protocol: 'ilp',
              contentType: FrameContentType.ApplicationOctetStream,
              payload: Buffer.from('Goodbye!')
            })
          }, 0)
        }))
      })
    })
    await server.listen({ host: '127.0.0.1', port: 5050 })
  })

  it('Send a request', async () => {
    const client = await createConnection('127.0.0.1:5050',{
      accountId: 'test',
      accountInfo: {
        relation: 'child',
        assetCode: 'XRP',
        assetScale: 9
      }
    })

    const response = await client.request({
      protocol: 'ilp',
      contentType: FrameContentType.ApplicationOctetStream,
      payload: Buffer.from('Hello')
    })

    assert.equal(response.payload.toString(), Buffer.from('Goodbye!').toString())
  })
})
