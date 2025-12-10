Create TLS certs for local testing (self-signed) and place them as:
- ./nginx/certs/fullchain.pem
- ./nginx/certs/privkey.pem

Example (create self-signed for localhost):
openssl req -x509 -nodes -newkey rsa:2048 -keyout privkey.pem -out fullchain.pem -days 365 -subj "/CN=localhost"

Place the generated files into ./nginx/certs/ and restart docker-compose.
