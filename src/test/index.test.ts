import 'mocha'
import * as sinon from 'sinon'
import * as Chai from 'chai'
import * as chaiAsPromised from 'chai-as-promised'
import { BtpError, BtpMessage, BtpMessageContentType, BtpServer, BtpStream, createConnection } from '../lib'
import createLogger from 'ilp-logger'
const log = createLogger('ilp-protocol-btp')
Chai.use(chaiAsPromised)
const assert = Object.assign(Chai.assert, sinon.assert)

describe('Real connection', () => {

  let server: BtpServer

  beforeEach(async () => {

    server = new BtpServer({}, { log: log }).on('connection', (connection: BtpStream) => {
      connection.on('request', (message: BtpMessage, replyCallback: (reply: BtpMessage | BtpError | Promise<BtpMessage | BtpError>) => void) => {
        replyCallback(new Promise((respond) => {
          setTimeout(() => {
            respond({
              protocol: 'ilp',
              contentType: BtpMessageContentType.ApplicationOctetStream,
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
      contentType: BtpMessageContentType.ApplicationOctetStream,
      payload: Buffer.from('Hello')
    })

    assert.equal(response.payload.toString(), Buffer.from('Goodbye!').toString())
  })
})
