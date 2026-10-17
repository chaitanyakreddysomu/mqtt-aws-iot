
export const awsIotConfig = {
  host:
    process.env.AWS_IOT_HOST ||
    "a542fogxy57b1-ats.iot.ap-south-1.amazonaws.com",

  port: Number(process.env.AWS_IOT_PORT || 8883),

  // Production: read certificate and key from environment variables.
  // Local: fall back to certificate files.
  certificatePem: process.env.AWS_IOT_CERTIFICATE_PEM || "",
  privateKeyPem: process.env.AWS_IOT_PRIVATE_KEY_PEM || "",

  certificatePath:
    process.env.AWS_IOT_CERTIFICATE_PATH ||
    "./certs/certificate.pem.crt",

  privateKeyPath:
    process.env.AWS_IOT_PRIVATE_KEY_PATH ||
    "./certs/private.pem.key",

  topic: process.env.AWS_IOT_TOPIC || "#",
};
