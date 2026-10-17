/**
 * AWS IoT Core mutual-TLS settings. Keep the certificate and private key on
 * this Node.js machine; do not put them in browser code or commit them.
 */
export const awsIotConfig = {
  host: "a542fogxy57b1-ats.iot.ap-south-1.amazonaws.com",
  port: 8883,
  certificatePath: "./certs/certificate.pem.crt",
  privateKeyPath: "./certs/private.pem.key",
  topic: "#",
};
