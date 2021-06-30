//Bucket Configurations
let bucketName = 'fhostbucket';
let bucketRegion = 'us-east-1';
let IdentityPoolId = 'us-east-1:45bec6e6-713f-4f35-a742-a029737913a9';



  
  // Create and upload the object to the specified Amazon S3 bucket.
  const s3Upload = async (file) => {
    const bucketParams = {
        Bucket: bucketName,
        // Specify the name of the new object. For example, 'index.html'.
        // To create a directory for the object, use '/'. For example, 'myApp/package.json'.
        Key: `userfiles/${file.name}`,
        // Content of the new object.
        Body: file,
      };

    try {
      const data = await s3Client.send(new PutObjectCommand(bucketParams));
      console.log(
        "Successfully uploaded object: " +
          bucketParams.Bucket +
          "/" +
          bucketParams.Key
      );
    } catch (err) {
      console.log("Error", err);
    }
  };