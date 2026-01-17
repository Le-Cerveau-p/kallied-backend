import { PrismaClient, Role } from '@prisma/client';
import * as bcrypt from 'bcrypt';

const prisma = new PrismaClient();

async function main() {
  const password = await bcrypt.hash('Password123!', 10);

  await prisma.user.upsert({
    where: { email: 'admin@kallied.com' },
    update: {},
    create: {
      name: 'System Admin',
      email: 'admin@kallied.com',
      password,
      role: Role.ADMIN,
    },
  });

  await prisma.user.upsert({
    where: { email: 'staff@kallied.com' },
    update: {},
    create: {
      name: 'Staff Member',
      email: 'staff@kallied.com',
      password,
      role: Role.STAFF,
    },
  });

  await prisma.user.upsert({
    where: { email: 'client@kallied.com' },
    update: {},
    create: {
      name: 'Test Client',
      email: 'client@kallied.com',
      password,
      role: Role.CLIENT,
    },
  });

  console.log('✅ Admin & Staff seeded');
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
