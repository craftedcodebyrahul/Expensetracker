require('dotenv').config();
const { PrismaLibSql } = require('@prisma/adapter-libsql');
const { PrismaClient } = require('@prisma/client');

const url = process.env.TURSO_DATABASE_URL;
const token = process.env.TURSO_AUTH_TOKEN;

const adapter = new PrismaLibSql({ url, authToken: token || undefined });
const prisma = new PrismaClient({ adapter });

async function main() {
  // Let's delete the duplicate "Amazon Prime membership" schedule with category 'entertainment' (the user has a newer one under 'subscriptions')
  // ID: 9d434267-b104-45c3-9324-e4f413986821
  const delAmazon = await prisma.recurringSchedule.deleteMany({
    where: {
      id: "9d434267-b104-45c3-9324-e4f413986821",
      userId: "107481854777221548032"
    }
  });
  console.log("Deleted old Amazon Prime schedule:", delAmazon);

  // Let's delete the duplicate "apple care" schedule (the user has two, one starting June 5, one starting June 18. Let's keep the newer one starting June 18)
  // ID to delete: a59dd9d1-2e43-487e-a386-7c3bbd7abab9
  const delApple = await prisma.recurringSchedule.deleteMany({
    where: {
      id: "a59dd9d1-2e43-487e-a386-7c3bbd7abab9",
      userId: "107481854777221548032"
    }
  });
  console.log("Deleted old Apple care schedule:", delApple);
}

main().catch(console.error).finally(() => prisma.$disconnect());
