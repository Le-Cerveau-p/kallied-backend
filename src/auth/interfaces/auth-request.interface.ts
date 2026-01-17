import { Request } from 'express';
import { User } from '@prisma/client';

export interface AuthRequest extends Request {
  user: {
    id: string;
    role: 'ADMIN' | 'STAFF' | 'CLIENT';
    email: string;
  };
}
