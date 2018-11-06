import { BtpError, BtpStream, BtpServer, BtpMessage, BtpMessageContentType } from '../lib'
import { default as createLogger } from 'ilp-logger'

const server = new BtpServer({}, {
  log: createLogger('btp-server'),
  authenticate: () => Promise.resolve({ id: 'test' })
})
server.on('listening', () => {
  console.log('Listening...')
})

server.on('connection', (stream: BtpStream) => {

  const { accountId, accountInfo } = stream

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
      }, 100)
    }))
  })

  stream.on('error', (error) => console.log(error))

  stream.on('cancelled', (error) => console.log('cancelled', error))

})

server.listen({
  host: '0.0.0.0',
  port: 5001
})
