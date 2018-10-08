import { BtpServer } from '../lib/server'
import { BtpMessage, BtpMessageContentType } from '../lib/packet'
import { BtpError } from '../lib/error'
import { BtpSocket } from '../lib/socket'
import { createLogger } from 'ilp-module-loader'

const server = new BtpServer({},{
  log: createLogger('btp-server'),
  authenticate: () => Promise.resolve({ account: 'alice' })
})
server.on('listening', () => {
  console.log('Listening...')
})

server.on('connection', (socket: BtpSocket) => {
  console.log(`CONNECTION: state=${socket.state}`)
  socket.on('message', (message: BtpMessage) => {
    console.log(`MESSAGE (protocol=${message.protocol}): ${message.payload.toString()}`)
  })
  socket.on('request', (message: BtpMessage, replyCallback: (reply: BtpMessage | BtpError | Promise<BtpMessage | BtpError>) => void) => {
    console.log(`REQUEST (protocol=${message.protocol}): ${message.payload.toString()}`)
    replyCallback(new Promise((respond) => {
      setTimeout(() => {
        respond({
          protocol: 'ilp',
          contentType: BtpMessageContentType.ApplicationOctetStream,
          payload: Buffer.from('Goodbye!')
        })
      }, 1000)
    }))
  })
})

server.listen({
  path: '/tmp/btp-server.sock'
})
