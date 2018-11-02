import { createConnection, BtpMessageContentType } from '../lib'

(async () => {
  const client = await createConnection('127.0.0.1:5001', {
    headers: {
      authorization: 'Bearer TOKEN'
    }
  })

  client.on('error', (data: any) =>  {
    console.log(data)
  })

  await new Promise(res => setTimeout(res, 1000))

  client.message({
    protocol: 'ilp',
    contentType: BtpMessageContentType.ApplicationOctetStream,
    payload: Buffer.from('Hello World!')
  })

  client.request({
    protocol: 'ilp',
    contentType: BtpMessageContentType.ApplicationOctetStream,
    payload: Buffer.from('Hello?')
  }).then((resp) => {
    console.log(`RESPONSE: ${resp.payload.toString()}`)
  })
  client.request({
    protocol: 'ilp',
    contentType: BtpMessageContentType.ApplicationOctetStream,
    payload: Buffer.from('Hello?')
  }).then((resp) => {
    console.log(`RESPONSE: ${resp.payload.toString()}`)
  })
  client.request({
    protocol: 'ilp',
    contentType: BtpMessageContentType.ApplicationOctetStream,
    payload: Buffer.from('Hello?')
  }).then((resp) => {
    console.log(`RESPONSE: ${resp.payload.toString()}`)
  })
  client.request({
    protocol: 'ilp',
    contentType: BtpMessageContentType.ApplicationOctetStream,
    payload: Buffer.from('Hello?')
  }).then((resp) => {
    console.log(`RESPONSE: ${resp.payload.toString()}`)
  })
  //

})()
