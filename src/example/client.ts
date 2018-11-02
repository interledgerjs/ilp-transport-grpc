import { createConnection, BtpMessageContentType } from '../lib'

(async () => {
  const client = await createConnection('127.0.0.1:5001', {
    headers: {
      authorization: 'Bearer TOKEN'
    },
    accountId: 'test',
    accountInfo: {
      relation: 'child',
      assetScale: 9,
      assetCode: 'xrp'
    }
  })

  client.on('error', (data: any) =>  {
    console.log(data)
  })

  console.time('test')
  let array = []

  for (let i = 0; i < 100000; i++) {
    array.push(client.request({
      protocol: 'ilp',
      contentType: BtpMessageContentType.ApplicationOctetStream,
      payload: Buffer.from('Hello?')
    }))
  }

  await Promise.all(array)

  console.timeEnd('test')
})()
