# ilp-transport-grpc
ilp-transport-grpc module provides an asynchronous request-response framework for communicating ILP packets between clients and a server over an underlying gRPC bidirectional stream.


#Server
```javascript
const server = new GrpcTransportServer({}, {
  log: createLogger('grpc-server'),
  authenticate: () => Promise.resolve({ id: 'test' })
})

// Listen on unused port
server.listen({
  host: '0.0.0.0',
  port: 5001
})

```

#Client
```javascript
const client = await createConnection('127.0.0.1:5001');

client.on('error', (data) =>  {
    console.log(data)
})

client.on('request', (data) =>  {
    console.log(data)
})

const response = await client.request({
    protocol: 'ilp',
    contentType: FrameContentType.ApplicationOctetStream,
    payload: Buffer.from('Hello?')
  })
```

