import { BtpError, BtpStream, BtpServer, BtpMessage, BtpMessageContentType } from '../lib'
import { createLogger } from 'ilp-module-loader'

const server = new BtpServer({}, {
  log: createLogger('btp-server'),
  authenticate: () => Promise.resolve({ account: 'alice' })
})
server.on('listening', () => {
  console.log('Listening...')
})

server.on('connection', (stream: BtpStream) => {
  console.log(`CONNECTION: state=${stream.state}`)
  stream.on('message', (message: BtpMessage) => {
    console.log(`MESSAGE (protocol=${message.protocol}): ${message.payload.toString()}`)
  })
  stream.on('request', (message: BtpMessage, replyCallback: (reply: BtpMessage | BtpError | Promise<BtpMessage | BtpError>) => void) => {
    console.log(`REQUEST (protocol=${message.protocol}): ${message.payload.toString()}`)
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
  stream.on('error', (error) => console.log(error))
})

server.listen({
  host: '0.0.0.0',
  port: 5001
})
