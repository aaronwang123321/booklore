import { PrismaClient, Role, LibraryRole, SubscriptionStatus } from '@prisma/client';
import * as bcrypt from 'bcrypt';

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Starting database seeding...');

  // Create admin user
  const adminPassword = await bcrypt.hash('admin123', 10);
  const admin = await prisma.user.upsert({
    where: { email: 'admin@booklore.app' },
    update: {},
    create: {
      email: 'admin@booklore.app',
      name: 'Admin User',
      password: adminPassword,
      role: Role.ADMIN,
      emailVerified: true,
    },
  });

  console.log('✅ Created admin user:', admin.email);

  // Create demo user
  const demoPassword = await bcrypt.hash('demo123', 10);
  const demoUser = await prisma.user.upsert({
    where: { email: 'demo@booklore.app' },
    update: {},
    create: {
      email: 'demo@booklore.app',
      name: 'Demo User',
      password: demoPassword,
      role: Role.USER,
      emailVerified: true,
    },
  });

  console.log('✅ Created demo user:', demoUser.email);

  // Create demo library
  const demoLibrary = await prisma.library.upsert({
    where: { id: 1 },
    update: {},
    create: {
      name: 'Demo Library',
      description: 'A demo library for testing BookLore features',
      isPublic: true,
      ownerId: demoUser.id,
    },
  });

  console.log('✅ Created demo library:', demoLibrary.name);

  // Add admin as library member
  await prisma.libraryMember.upsert({
    where: {
      userId_libraryId: {
        userId: admin.id,
        libraryId: demoLibrary.id,
      },
    },
    update: {},
    create: {
      userId: admin.id,
      libraryId: demoLibrary.id,
      role: LibraryRole.ADMIN,
    },
  });

  // Create demo shelves
  const fictionShelf = await prisma.shelf.upsert({
    where: { id: 1 },
    update: {},
    create: {
      name: 'Fiction',
      description: 'Fiction books collection',
      color: '#3B82F6',
      order: 1,
      libraryId: demoLibrary.id,
    },
  });

  const nonFictionShelf = await prisma.shelf.upsert({
    where: { id: 2 },
    update: {},
    create: {
      name: 'Non-Fiction',
      description: 'Non-fiction books collection',
      color: '#10B981',
      order: 2,
      libraryId: demoLibrary.id,
    },
  });

  console.log('✅ Created demo shelves:', fictionShelf.name, nonFictionShelf.name);

  // Create trial subscription for demo user
  await prisma.subscription.upsert({
    where: { userId: demoUser.id },
    update: {},
    create: {
      userId: demoUser.id,
      status: SubscriptionStatus.TRIAL,
      trialStart: new Date(),
      trialEnd: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000), // 14 days from now
    },
  });

  console.log('✅ Created trial subscription for demo user');

  // Create app settings
  await prisma.appSetting.upsert({
    where: { key: 'app_name' },
    update: {},
    create: {
      key: 'app_name',
      value: 'BookLore',
    },
  });

  await prisma.appSetting.upsert({
    where: { key: 'app_version' },
    update: {},
    create: {
      key: 'app_version',
      value: '1.0.0',
    },
  });

  await prisma.appSetting.upsert({
    where: { key: 'registration_enabled' },
    update: {},
    create: {
      key: 'registration_enabled',
      value: true,
    },
  });

  await prisma.appSetting.upsert({
    where: { key: 'max_file_size' },
    update: {},
    create: {
      key: 'max_file_size',
      value: 104857600, // 100MB
    },
  });

  console.log('✅ Created app settings');

  // Create email provider (placeholder)
  await prisma.emailProvider.upsert({
    where: { id: 1 },
    update: {},
    create: {
      name: 'Default SMTP',
      host: 'smtp.gmail.com',
      port: 587,
      secure: false,
      username: 'noreply@booklore.app',
      password: 'placeholder',
      isDefault: true,
    },
  });

  console.log('✅ Created default email provider');

  console.log('🎉 Database seeding completed successfully!');
}

main()
  .catch((e) => {
    console.error('❌ Database seeding failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });