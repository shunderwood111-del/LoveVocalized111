// lib/consumeOnSuccess.js
import prisma from "./prisma.js";

/**
 * Idempotently increments songsUsed for the customer's entitlement
 * the first time a given job succeeds.
 *
 * @param {object} opts
 * @param {string} opts.customerId - Stripe cus_...
 * @param {string} opts.externalJob - your provider's job id (same you return to the client)
 * @returns {Promise<boolean>} true if consumption happened this call, false otherwise
 */
export async function consumeIfNeeded({ customerId, externalJob }) {
  if (!customerId || !externalJob) return false;

  return await prisma.$transaction(async (tx) => {
    const job = await tx.songJob.findUnique({ where: { externalJob } });
    if (!job) return false;
    if (job.consumed) return false; // already counted

    // Mark consumed and increment usage atomically
    await tx.songJob.update({
      where: { id: job.id },
      data: { consumed: true },
    });

    await tx.customerEntitlement.update({
      where: { customerId },
      data: { songsUsed: { increment: 1 } },
    });

    return true;
  });
}
