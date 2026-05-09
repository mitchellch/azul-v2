import { expressjwt } from 'express-jwt';
import { expressJwtSecret } from 'jwks-rsa';

export const jwtMiddleware = expressjwt({
  secret: expressJwtSecret({
    jwksUri: `https://${process.env.AUTH0_DOMAIN}/.well-known/jwks.json`,
    cache: true,
    rateLimit: true,
  }),
  audience: process.env.AUTH0_AUDIENCE,
  issuer:   `https://${process.env.AUTH0_DOMAIN}/`,
  algorithms: ['RS256'],
});
