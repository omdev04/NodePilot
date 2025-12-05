import { FastifyRequest, FastifyReply } from 'fastify';

export async function authenticate(request: FastifyRequest, reply: FastifyReply) {
  try {
    const decoded = await request.jwtVerify() as any;
    // Set userId on request object for use in routes
    (request as any).userId = decoded.id;
    // Auth success log removed to reduce console noise
  } catch (err) {
    console.error('❌ Authentication failed:', err);
    reply.status(401).send({ error: 'Unauthorized' });
  }
}
