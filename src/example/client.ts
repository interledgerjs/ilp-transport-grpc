import { createConnection, BtpMessageContentType } from '../lib'

(async () => {
  const client = await createConnection('127.0.0.1:5005', {
    headers: {
      authorization: 'Bearer TOKEN'
    }
  })
  client.message({
    protocol: 'ilp',
    contentType: BtpMessageContentType.ApplicationOctetStream,
    payload: Buffer.from('Hello World!')
  })

  const resp = await client.request({
    protocol: 'ilp',
    contentType: BtpMessageContentType.ApplicationOctetStream,
    payload: Buffer.from('Hello?')
  })

  console.log(`RESPONSE: ${resp.payload.toString()}`)

})()
