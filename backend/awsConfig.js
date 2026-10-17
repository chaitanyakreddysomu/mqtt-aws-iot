/**
 * AWS IoT Core mutual-TLS settings. Keep the certificate and private key on
 * this Node.js machine; do not put them in browser code or commit them.
 */
export const awsIotConfig = {
  host: process.env.AWS_IOT_HOST || "a542fogxy57b1-ats.iot.ap-south-1.amazonaws.com",
  port: Number(process.env.AWS_IOT_PORT || 8883),
  certificatePath: process.env.AWS_IOT_CERTIFICATE_PATH || "./certs/certificate.pem.crt",
  privateKeyPath: process.env.AWS_IOT_PRIVATE_KEY_PATH || "./certs/private.pem.key",
  topic: process.env.AWS_IOT_TOPIC || "#",
};
