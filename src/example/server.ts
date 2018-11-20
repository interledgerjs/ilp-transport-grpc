import { TransportError, GrpcTransport, GrpcTransportServer, MessagePayload, FrameContentType } from '../lib'
import { default as createLogger } from 'ilp-logger'

const server = new GrpcTransportServer({}, {
  log: createLogger('grpc-server'),
  authenticate: () => Promise.resolve({ id: 'test' })
})
server.on('listening', () => {
  console.log('Listening...')
})

server.on('connection', (stream: GrpcTransport) => {

  const { accountId, accountInfo } = stream

  console.log(`CONNECTION: state=${stream.state}`)

  stream.on('message', (message: MessagePayload) => {
    console.log(`MESSAGE (protocol=${message.protocol}): ${message.payload.toString()}`)
  })

  stream.on('request', (message: MessagePayload, replyCallback: (reply: MessagePayload | TransportError | Promise<MessagePayload | TransportError>) => void) => {
    console.log(`REQUEST (protocol=${message.protocol}): ${message.payload.toString()}`)
    replyCallback(new Promise((respond) => {
      setTimeout(() => {
        respond({
          protocol: 'ilp',
          contentType: FrameContentType.ApplicationOctetStream,
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
