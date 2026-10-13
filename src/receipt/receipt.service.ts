/* eslint-disable @typescript-eslint/no-unsafe-return */
/* eslint-disable @typescript-eslint/no-unsafe-call */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
import {
  Injectable,
  NotFoundException,
  BadRequestException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { ReceiptBuilder } from './builder/receipt.builder';
import { CloudinaryService } from '../cloudinary/cloudinary.service';
import { Order, OrderItem, User, Address, OrderStatus } from '@prisma/client';
import { generatePdfFromTemplate, getTemplatePath } from '../utils/pdf';
import QRCode from 'qrcode';
import dayjs from 'dayjs';

type OrderWithRelations = Order & {
  orderItems: (OrderItem & { paper?: { name: string } })[];
  user: User;
  address?: Address | null;
};

@Injectable()
export class ReceiptService {
  constructor(
    private prisma: PrismaService,
    private cloudinaryService: CloudinaryService,
  ) {}

  /**
   * Auto-confirm order when receipt is generated
   *
   * Uses updateMany with a status filter so an already-confirmed order is
   * left untouched. This matters because generate() treats a receipt as
   * stale when the order's `updatedAt` is newer than the receipt's
   * `generatedAt` — an unconditional update here would bump `updatedAt` on
   * every generate call and force a needless regeneration loop.
   */
  async confirmOrder(orderId: string): Promise<void> {
    await this.prisma.order.updateMany({
      where: { id: orderId, status: { not: OrderStatus.CONFIRMED } },
      data: { status: OrderStatus.CONFIRMED },
    });
  }

  /**
   * Generate a receipt for an order
   */
  async generate(
    orderId: string,
    retryCount = 0,
  ): Promise<{ pdfUrl: string; receiptNumber: string }> {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      include: {
        orderItems: {
          include: {
            paper: true,
          },
        },
        user: true,
        address: true,
      },
    });

    if (!order) {
      throw new NotFoundException('Order not found');
    }

    console.log('[RECEIPT] generate() called', {
      orderId,
      orderNumber: order.orderNumber,
      shipping: order.shipping,
      discount: order.discount,
      subtotal: order.subtotal,
      total: order.total,
      orderUpdatedAt: order.updatedAt,
      retryCount,
    });

    // Check if a receipt already exists
    const existingReceipt = await this.prisma.receipt.findUnique({
      where: { orderId },
    });

    if (existingReceipt) {
      // The receipt PDF is a snapshot of the order at generation time. If
      // the order was modified afterwards — e.g. the admin set the delivery
      // charge after checkout — the stored PDF is stale and would still
      // show the old values (shipping 0). Rebuild it so the receipt always
      // reflects the current order.
      const isStale =
        order.updatedAt.getTime() > existingReceipt.generatedAt.getTime();

      console.log('[RECEIPT] existing receipt found', {
        receiptId: existingReceipt.id,
        receiptGeneratedAt: existingReceipt.generatedAt,
        pdfUrl: existingReceipt.pdfUrl,
        orderUpdatedAt: order.updatedAt,
        isStale,
      });

      if (!isStale) {
        console.log('[RECEIPT] returning CACHED receipt (order not modified)');
        return {
          pdfUrl: existingReceipt.pdfUrl,
          receiptNumber: existingReceipt.receiptNumber,
        };
      }

      console.log('[RECEIPT] receipt is STALE — rebuilding from current order');

      // Delete the stale PDF from Cloudinary and drop the receipt record,
      // then fall through to generate a fresh one below.
      if (existingReceipt.publicId) {
        try {
          await this.cloudinaryService.deleteFile(
            existingReceipt.publicId,
            'raw',
          );
        } catch (error) {
          console.error(
            'Failed to delete stale receipt from Cloudinary:',
            error,
          );
        }
      }

      await this.prisma.receipt.delete({
        where: { id: existingReceipt.id },
      });
    }

    // Generate QR code
    const verificationUrl = `${process.env.APP_URL || 'http://localhost:3000'}/receipts/verify/${order.orderNumber}`;
    const qrCodeDataUrl = await QRCode.toDataURL(verificationUrl, {
      width: 300,
      margin: 2,
      color: {
        dark: '#1e40af',
        light: '#ffffff',
      },
    });

    // Build receipt data
    const receiptData = ReceiptBuilder.build(
      order as OrderWithRelations,
      qrCodeDataUrl,
    );

    console.log('[RECEIPT] receipt data built from order snapshot', {
      shipping: receiptData.shipping,
      discount: receiptData.discount,
      subtotal: receiptData.subtotal,
      grandTotal: receiptData.grandTotal,
    });

    // Generate PDF
    const templatePath = getTemplatePath('receipt.hbs');
    let pdfBuffer: Buffer;

    try {
      pdfBuffer = await generatePdfFromTemplate(
        templatePath,
        receiptData as any,
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      console.error('Failed to generate PDF:', message);
      throw new BadRequestException(
        `Failed to generate receipt PDF: ${message}`,
      );
    }

    // Upload to Cloudinary
    let uploadResult: { url: string; publicId: string };

    try {
      uploadResult = await this.cloudinaryService.uploadFile(
        {
          buffer: pdfBuffer,
          mimetype: 'application/pdf',
          originalname: `receipt-${order.orderNumber}.pdf`,
        } as any,
        'receipts',
      );
    } catch (error) {
      console.error('Failed to upload PDF to Cloudinary:', error);
      throw new BadRequestException(
        'Failed to upload receipt to cloud storage',
      );
    }

    // The order may have changed while the PDF was being generated and
    // uploaded (e.g. the admin set the delivery charge mid-upload). The
    // receipt's generatedAt is set at INSERT time — after the upload — so
    // without this check a PDF built from stale order data would look
    // "fresh" to the staleness check above and never be rebuilt.
    const currentOrder = await this.prisma.order.findUnique({
      where: { id: orderId },
      select: { updatedAt: true, shipping: true },
    });

    if (
      currentOrder &&
      currentOrder.updatedAt.getTime() > order.updatedAt.getTime()
    ) {
      console.warn('[RECEIPT] order changed DURING PDF generation', {
        snapshotUpdatedAt: order.updatedAt,
        currentUpdatedAt: currentOrder.updatedAt,
        snapshotShipping: order.shipping,
        currentShipping: currentOrder.shipping,
        retryCount,
      });

      if (retryCount < 2) {
        // Clean up the PDF we just uploaded — it was built from stale data
        try {
          await this.cloudinaryService.deleteFile(uploadResult.publicId, 'raw');
        } catch (error) {
          console.error('Failed to delete orphaned receipt PDF:', error);
        }
        console.log('[RECEIPT] retrying with fresh order data');
        return this.generate(orderId, retryCount + 1);
      }

      console.error(
        '[RECEIPT] retry limit reached — saving possibly stale PDF',
      );
    }

    // Generate receipt number
    const receiptNumber = `RC-${dayjs().format('YYYYMMDD')}-${String(order.id).slice(-6).toUpperCase()}`;

    // Save receipt record
    const receipt = await this.prisma.receipt.create({
      data: {
        orderId: order.id,
        receiptNumber,
        pdfUrl: uploadResult.url,
        publicId: uploadResult.publicId,
        qrCodeUrl: qrCodeDataUrl,
      },
    });

    console.log('[RECEIPT] new receipt saved', {
      receiptId: receipt.id,
      receiptNumber: receipt.receiptNumber,
      pdfUrl: receipt.pdfUrl,
    });

    return {
      pdfUrl: receipt.pdfUrl,
      receiptNumber: receipt.receiptNumber,
    };
  }

  /**
   * Get receipt by order ID
   */
  async findByOrderId(
    orderId: string,
    userId: string,
    requestingUserRole: string,
  ) {
    const where: any = { orderId };

    // If not admin, verify the order belongs to the user
    if (requestingUserRole !== 'ADMIN') {
      const order = await this.prisma.order.findUnique({
        where: { id: orderId },
        select: { userId: true },
      });

      if (!order || order.userId !== userId) {
        throw new NotFoundException('Receipt not found');
      }
    }

    const receipt = await this.prisma.receipt.findUnique({
      where,
      include: {
        order: {
          include: {
            orderItems: {
              include: {
                paper: true,
              },
            },
            user: true,
            address: true,
          },
        },
      },
    });

    if (!receipt) {
      if (requestingUserRole !== 'ADMIN') {
        throw new UnprocessableEntityException(
          'Receipt has not been generated yet',
        );
      }
      throw new NotFoundException('Receipt not found');
    }

    return receipt;
  }

  /**
   * Get receipt by receipt number (public verification)
   */
  async findByReceiptNumber(receiptNumber: string) {
    const receipt = await this.prisma.receipt.findUnique({
      where: { receiptNumber },
      include: {
        order: {
          include: {
            orderItems: {
              include: {
                paper: true,
              },
            },
            user: true,
            address: true,
          },
        },
      },
    });

    if (!receipt) {
      throw new NotFoundException('Receipt not found');
    }

    return receipt;
  }

  /**
   * Regenerate a receipt (delete old and create new)
   */
  async regenerate(
    orderId: string,
  ): Promise<{ pdfUrl: string; receiptNumber: string }> {
    const existingReceipt = await this.prisma.receipt.findUnique({
      where: { orderId },
    });

    if (existingReceipt) {
      // Delete old PDF from Cloudinary
      if (existingReceipt.publicId) {
        try {
          await this.cloudinaryService.deleteFile(
            existingReceipt.publicId,
            'raw',
          );
        } catch (error) {
          console.error('Failed to delete old receipt from Cloudinary:', error);
        }
      }

      // Delete old receipt record
      await this.prisma.receipt.delete({
        where: { id: existingReceipt.id },
      });
    }

    return this.generate(orderId);
  }
}
