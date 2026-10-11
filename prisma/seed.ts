/* eslint-disable @typescript-eslint/no-unused-vars */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-unsafe-call */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
import {
  PrismaClient,
  Role,
  Provider,
  UserStatus,
  BookStatus,
  PaymentMethod,
} from '@prisma/client';
import * as bcrypt from 'bcrypt';

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Seeding database...');

  // Create admin user
  const adminPassword = await bcrypt.hash('admin123', 10);
  const admin = await prisma.user.upsert({
    where: { email: 'admin@bookstore.com' },
    update: {},
    create: {
      email: 'admin@bookstore.com',
      password: adminPassword,
      firstName: 'Admin',
      lastName: 'User',
      role: Role.ADMIN,
      provider: Provider.EMAIL,
      status: UserStatus.ACTIVE,
      emailVerified: true,
    },
  });
  console.log('👤 Created admin user');

  // Create admin user
  const userPassword = await bcrypt.hash('user123', 10);
  const user = await prisma.user.upsert({
    where: { email: 'user@bookstore.com' },
    update: {},
    create: {
      email: 'user@bookstore.com',
      password: userPassword,
      firstName: 'User',
      lastName: 'G',
      role: Role.USER,
      provider: Provider.EMAIL,
      status: UserStatus.ACTIVE,
      emailVerified: true,
    },
  });
  console.log('👤 Created user');

  // Create sample publication
  const publication = await prisma.publication.upsert({
    where: { slug: 'penguin-random-house' },
    update: {},
    create: {
      name: 'Penguin Random House',
      slug: 'penguin-random-house',
      description: "World's largest trade book publisher",
      status: BookStatus.PUBLISHED,
      isActive: true,
    },
  });
  console.log('🏢 Created publication');

  // Create sample subject
  const subject = await prisma.subject.upsert({
    where: { slug: 'fiction' },
    update: {},
    create: {
      name: 'Fiction',
      slug: 'fiction',
      description: 'Fiction books and novels',
      publicationId: publication.id,
      isActive: true,
    },
  });
  console.log('📚 Created subject');

  // Create sample book
  const book = await prisma.book.upsert({
    where: { slug: 'sample-book' },
    update: {},
    create: {
      title: 'Sample Book',
      slug: 'sample-book',
      shortDescription: 'A sample book for testing',
      description: 'This is a detailed description of the sample book.',
      publicationDate: new Date('2024-01-01'),
      edition: '1st Edition',
      language: 'English',
      status: BookStatus.PUBLISHED,
      publicationId: publication.id,
      subjectId: subject.id,
    },
  });
  console.log('📖 Created book');

  // Create sample book paper
  const bookPaper = await prisma.bookPaper.upsert({
    where: { isbn: '978-0-123456-78-9' },
    update: {},
    create: {
      bookId: book.id,
      code: 'A',
      name: 'Standard Edition',
      price: 29.99,
      discountPrice: 24.99,
      stock: 100,
      isbn: '978-0-123456-78-9',
      pageCount: 250,
      isDefault: true,
      status: BookStatus.PUBLISHED,
    },
  });
  console.log('📄 Created book paper');

  // Create a second book (no image/thumbnail) with full descriptions and 2 parts
  const book2 = await prisma.book.upsert({
    where: { slug: 'higher-mathematics-for-hsc-examination' },
    update: {},
    create: {
      title: 'Higher Mathematics for HSC Examination',
      slug: 'higher-mathematics-for-hsc-examination',
      shortDescription:
        'A complete, exam-focused Higher Mathematics guide for HSC candidates ' +
        'covering algebra, calculus, coordinate geometry, and trigonometry with ' +
        'solved board questions, model tests, and chapter-wise practice sets.',
      description:
        'This comprehensive Higher Mathematics textbook is designed specifically ' +
        'for HSC (Higher Secondary Certificate) students preparing for their ' +
        'board examinations. The book is structured into clearly defined units ' +
        'that follow the national curriculum precisely.\n\n' +
        'Unit 1 builds a strong foundation in algebra and functions, while Unit 2 ' +
        'introduces limits, continuity, and differentiation with step-by-step ' +
        'worked examples. Unit 3 covers integration techniques and their ' +
        'applications to area and volume problems. The final units address ' +
        'coordinate geometry, vectors, and trigonometry, each reinforced with ' +
        'illustrative diagrams.\n\n' +
        'Every chapter ends with a set of board-style questions, past-paper ' +
        'problems, and three full-length model tests with answer keys. Common ' +
        'student mistakes are highlighted in dedicated "Caution" boxes, and a ' +
        'formula reference sheet is provided at the end for quick revision.',
      publicationDate: new Date('2025-01-15'),
      edition: '3rd Revised Edition',
      language: 'Bengali',
      status: BookStatus.PUBLISHED,
      publicationId: publication.id,
      subjectId: subject.id,
    },
  });
  console.log('📖 Created second book');

  // Create 2 parts (papers) of the second book
  const bookPaper2a = await prisma.bookPaper.upsert({
    where: { isbn: '978-984-1234-56-7' },
    update: {},
    create: {
      bookId: book2.id,
      code: 'HSC-MATH-PB',
      name: 'Paperback Edition',
      price: 450,
      discountPrice: 380,
      discountStartDate: new Date('2025-02-01'),
      discountEndDate: new Date('2025-03-31'),
      stock: 120,
      isbn: '978-984-1234-56-7',
      pageCount: 640,
      isDefault: true,
      status: BookStatus.PUBLISHED,
    },
  });
  console.log('📄 Created second book paper (paperback)');

  const bookPaper2b = await prisma.bookPaper.upsert({
    where: { isbn: '978-984-1234-57-4' },
    update: {},
    create: {
      bookId: book2.id,
      code: 'HSC-MATH-HB',
      name: 'Hardcover Premium Edition',
      price: 720,
      discountPrice: 650,
      discountStartDate: new Date('2025-02-01'),
      discountEndDate: new Date('2025-03-31'),
      stock: 60,
      isbn: '978-984-1234-57-4',
      pageCount: 640,
      isDefault: false,
      status: BookStatus.PUBLISHED,
    },
  });
  console.log('📄 Created second book paper (hardcover)');

  // Create sample banner
  const banner = await prisma.banner.create({
    data: {
      title: 'Welcome to Bookstore',
      subtitle: 'Discover amazing books',
      image: 'https://example.com/banner.jpg',
      buttonText: 'Shop Now',
      buttonUrl: '/books',
      displayOrder: 1,
      status: BookStatus.PUBLISHED,
    },
  });
  console.log('🎨 Created banner');

  // Create sample settings
  const settings = [
    { key: 'site_name', value: 'Bookstore CMS' },
    { key: 'currency', value: 'BDT' },
    { key: 'tax_rate', value: '0' },
  ];

  for (const setting of settings) {
    await prisma.setting.upsert({
      where: { key: setting.key },
      update: { value: setting.value },
      create: { key: setting.key, value: setting.value },
    });
  }
  console.log('⚙️ Created settings');

  // Create CLC Resource categories (navigation menu items)
  const topicalPastPapers = await prisma.category.upsert({
    where: { slug: 'topical-past-papers' },
    update: {},
    create: {
      name: 'Topical Past Papers',
      slug: 'topical-past-papers',
      isHidden: false,
      displayOrder: 1,
      icon: 'file-text',
      route: '/topical-past-papers',
    },
  });
  console.log('🏷️ Created category: Topical Past Papers');

  const yearWisePastPapers = await prisma.category.upsert({
    where: { slug: 'year-wise-past-papers' },
    update: {},
    create: {
      name: 'Year-wise Past Papers',
      slug: 'year-wise-past-papers',
      isHidden: false,
      displayOrder: 2,
      icon: 'calendar',
      route: '/year-wise-past-papers',
    },
  });
  console.log('🏷️ Created category: Year-wise Past Papers');

  const mockPapers = await prisma.category.upsert({
    where: { slug: 'mock-papers' },
    update: {},
    create: {
      name: 'Mock Papers',
      slug: 'mock-papers',
      isHidden: false,
      displayOrder: 3,
      icon: 'file-check',
      route: '/mock-papers',
    },
  });
  console.log('🏷️ Created category: Mock Papers');

  const textBooks = await prisma.category.upsert({
    where: { slug: 'text-books' },
    update: {},
    create: {
      name: 'Text Books',
      slug: 'text-books',
      isHidden: true,
      displayOrder: 4,
      icon: 'book',
      route: '/text-books',
    },
  });
  console.log('🏷️ Created category: Text Books (hidden)');

  const notes = await prisma.category.upsert({
    where: { slug: 'notes' },
    update: {},
    create: {
      name: 'Notes',
      slug: 'notes',
      isHidden: true,
      displayOrder: 5,
      icon: 'sticky-note',
      route: '/notes',
    },
  });
  console.log('🏷️ Created category: Notes (hidden)');

  // Assign existing books to categories (many-to-many via BookCategory)
  const existingBooks = await prisma.book.findMany({
    where: { deletedAt: null },
    select: { id: true },
  });

  for (const existingBook of existingBooks) {
    const existingAssignments = await prisma.bookCategory.findFirst({
      where: { bookId: existingBook.id },
    });

    if (!existingAssignments) {
      await prisma.bookCategory.create({
        data: {
          bookId: existingBook.id,
          categoryId: textBooks.id,
        },
      });
    }
  }
  console.log('🔗 Assigned existing books to Text Books category');

  console.log('✅ Database seeded successfully!');
}

main()
  .catch((e) => {
    console.error('❌ Seed failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
