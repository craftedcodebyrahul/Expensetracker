const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const schedules = await prisma.recurringSchedule.findMany({});
  console.log("SCHEDULES IN DB:");
  console.log(JSON.stringify(schedules, null, 2));

  const txns = await prisma.transaction.findMany({
    where: { isRecurring: 1 }
  });
  console.log("RECURRING TRANSACTIONS IN DB:");
  console.log(JSON.stringify(txns, null, 2));
}

main().catch(console.error).finally(() => prisma.$disconnect());
