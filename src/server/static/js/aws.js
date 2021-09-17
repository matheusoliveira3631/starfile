//Bucket Configurations'
const ENDPOINT_URL = "https://s3.pilw.io"

 
async function getCredentials(){
  const response = await fetch('/credentials')
  const data = await response.json()
  const result={
    ACCESS_KEY_ID : data['access_key'],
    ACCESS_KEY_SECRET : data['secret_key'],
    BUCKET_NAME : data['bucket']
  }
  return result
}
 
 
const s3Upload = function(file) {
  getCredentials().then((keys)=>{
    const bucket = new AWS.S3({
      accessKeyId: keys['ACCESS_KEY_ID'],
      secretAccessKey: keys['ACCESS_KEY_SECRET'],
      endpoint: new AWS.Endpoint(ENDPOINT_URL),
      params: {
          Bucket: keys['BUCKET_NAME']
      }
  })
  const params = {
    Key: 'userfiles/' + file.name,
    ContentType: file.type,
    Body: file,
    ACL: 'public-read'
}
  bucket.putObject(params, function(err, data) {
      if (err) {
          results.innerHTML = 'ERROR: ' + err;
          return
      }
})
  })
    
}
 