import { ObjectId } from 'mongodb';
import {
  normalizeStatus,
  ALLOWED_TRANSITIONS,
  computeOverallOrderStatus,
  ensureOrderCompatibility,
} from '../controllers/orderController';
import { IOrder, ISellerShipment, OrderStatus } from '../models/Order';

describe('Order Tracking System Business Logic & Validations', () => {
  describe('1. Status Normalization & Backward Compatibility', () => {
    test('should normalize all uppercase statuses correctly', () => {
      const statuses: OrderStatus[] = [
        'PENDING',
        'CONFIRMED',
        'PROCESSING',
        'PACKED',
        'SHIPPED',
        'OUT_FOR_DELIVERY',
        'DELIVERED',
        'CANCELLED',
        'DELIVERY_FAILED',
        'RETURN_REQUESTED',
        'RETURNED',
      ];

      for (const st of statuses) {
        expect(normalizeStatus(st)).toBe(st);
      }
    });

    test('should normalize legacy lowercase statuses to canonical uppercase', () => {
      expect(normalizeStatus('pending')).toBe('PENDING');
      expect(normalizeStatus('confirmed')).toBe('CONFIRMED');
      expect(normalizeStatus('processing')).toBe('PROCESSING');
      expect(normalizeStatus('packed')).toBe('PACKED');
      expect(normalizeStatus('shipped')).toBe('SHIPPED');
      expect(normalizeStatus('out_for_delivery')).toBe('OUT_FOR_DELIVERY');
      expect(normalizeStatus('delivered')).toBe('DELIVERED');
      expect(normalizeStatus('cancelled')).toBe('CANCELLED');
      expect(normalizeStatus('delivery_failed')).toBe('DELIVERY_FAILED');
      expect(normalizeStatus('return_requested')).toBe('RETURN_REQUESTED');
      expect(normalizeStatus('returned')).toBe('RETURNED');
    });

    test('should fallback to PENDING for undefined or invalid status', () => {
      expect(normalizeStatus(undefined)).toBe('PENDING');
      expect(normalizeStatus('unknown_status_xyz')).toBe('PENDING');
    });
  });

  describe('2. State Transition Validation Rules', () => {
    test('PENDING can only transition to CONFIRMED or CANCELLED', () => {
      const allowed = ALLOWED_TRANSITIONS['PENDING'];
      expect(allowed).toContain('CONFIRMED');
      expect(allowed).toContain('CANCELLED');
      expect(allowed).not.toContain('DELIVERED');
      expect(allowed).not.toContain('SHIPPED');
    });

    test('CONFIRMED can transition to PROCESSING or CANCELLED', () => {
      const allowed = ALLOWED_TRANSITIONS['CONFIRMED'];
      expect(allowed).toContain('PROCESSING');
      expect(allowed).toContain('CANCELLED');
      expect(allowed).not.toContain('DELIVERED');
    });

    test('PROCESSING can transition to PACKED or CANCELLED', () => {
      const allowed = ALLOWED_TRANSITIONS['PROCESSING'];
      expect(allowed).toContain('PACKED');
      expect(allowed).toContain('CANCELLED');
    });

    test('PACKED can transition to SHIPPED or CANCELLED', () => {
      const allowed = ALLOWED_TRANSITIONS['PACKED'];
      expect(allowed).toContain('SHIPPED');
      expect(allowed).toContain('CANCELLED');
    });

    test('SHIPPED can transition to OUT_FOR_DELIVERY or DELIVERY_FAILED', () => {
      const allowed = ALLOWED_TRANSITIONS['SHIPPED'];
      expect(allowed).toContain('OUT_FOR_DELIVERY');
      expect(allowed).toContain('DELIVERY_FAILED');
      expect(allowed).not.toContain('CANCELLED'); // Cannot cancel in transit without courier return
    });

    test('OUT_FOR_DELIVERY can transition to DELIVERED or DELIVERY_FAILED', () => {
      const allowed = ALLOWED_TRANSITIONS['OUT_FOR_DELIVERY'];
      expect(allowed).toContain('DELIVERED');
      expect(allowed).toContain('DELIVERY_FAILED');
    });

    test('DELIVERY_FAILED can re-attempt (OUT_FOR_DELIVERY), CANCELLED, or RETURNED', () => {
      const allowed = ALLOWED_TRANSITIONS['DELIVERY_FAILED'];
      expect(allowed).toContain('OUT_FOR_DELIVERY');
      expect(allowed).toContain('CANCELLED');
      expect(allowed).toContain('RETURNED');
    });

    test('DELIVERED can transition to RETURN_REQUESTED', () => {
      const allowed = ALLOWED_TRANSITIONS['DELIVERED'];
      expect(allowed).toContain('RETURN_REQUESTED');
      expect(allowed).not.toContain('CANCELLED');
    });

    test('RETURN_REQUESTED can be accepted (RETURNED) or rejected (DELIVERED)', () => {
      const allowed = ALLOWED_TRANSITIONS['RETURN_REQUESTED'];
      expect(allowed).toContain('RETURNED');
      expect(allowed).toContain('DELIVERED');
    });

    test('CANCELLED and RETURNED are terminal states', () => {
      expect(ALLOWED_TRANSITIONS['CANCELLED']).toHaveLength(0);
      expect(ALLOWED_TRANSITIONS['RETURNED']).toHaveLength(0);
    });
  });

  describe('3. Multi-Vendor Shipment Parent Order Status Resolution', () => {
    const dummySeller1 = new ObjectId();
    const dummySeller2 = new ObjectId();

    const createShipment = (id: string, sellerId: ObjectId, status: OrderStatus): ISellerShipment => ({
      shipmentId: id,
      sellerId,
      items: [],
      status,
      statusHistory: [],
    });

    test('should NOT mark parent DELIVERED if one seller is delivered but another is still shipped', () => {
      const shipments: ISellerShipment[] = [
        createShipment('shp-1', dummySeller1, 'DELIVERED'),
        createShipment('shp-2', dummySeller2, 'SHIPPED'),
      ];

      const parentStatus = computeOverallOrderStatus(shipments);
      expect(parentStatus).toBe('SHIPPED');
      expect(parentStatus).not.toBe('DELIVERED');
    });

    test('should mark parent DELIVERED only when all non-cancelled shipments are DELIVERED', () => {
      const shipments: ISellerShipment[] = [
        createShipment('shp-1', dummySeller1, 'DELIVERED'),
        createShipment('shp-2', dummySeller2, 'DELIVERED'),
      ];

      expect(computeOverallOrderStatus(shipments)).toBe('DELIVERED');
    });

    test('should mark parent DELIVERED if one seller shipment is DELIVERED and other is CANCELLED', () => {
      const shipments: ISellerShipment[] = [
        createShipment('shp-1', dummySeller1, 'DELIVERED'),
        createShipment('shp-2', dummySeller2, 'CANCELLED'),
      ];

      expect(computeOverallOrderStatus(shipments)).toBe('DELIVERED');
    });

    test('should mark parent CANCELLED if all seller shipments are CANCELLED', () => {
      const shipments: ISellerShipment[] = [
        createShipment('shp-1', dummySeller1, 'CANCELLED'),
        createShipment('shp-2', dummySeller2, 'CANCELLED'),
      ];

      expect(computeOverallOrderStatus(shipments)).toBe('CANCELLED');
    });

    test('should reflect OUT_FOR_DELIVERY if any active shipment is out for delivery', () => {
      const shipments: ISellerShipment[] = [
        createShipment('shp-1', dummySeller1, 'PACKED'),
        createShipment('shp-2', dummySeller2, 'OUT_FOR_DELIVERY'),
      ];

      expect(computeOverallOrderStatus(shipments)).toBe('OUT_FOR_DELIVERY');
    });

    test('should reflect DELIVERY_FAILED if a shipment failed delivery', () => {
      const shipments: ISellerShipment[] = [
        createShipment('shp-1', dummySeller1, 'DELIVERY_FAILED'),
        createShipment('shp-2', dummySeller2, 'SHIPPED'),
      ];

      expect(computeOverallOrderStatus(shipments)).toBe('DELIVERY_FAILED');
    });

    test('should reflect RETURN_REQUESTED if customer requested return on any shipment', () => {
      const shipments: ISellerShipment[] = [
        createShipment('shp-1', dummySeller1, 'RETURN_REQUESTED'),
        createShipment('shp-2', dummySeller2, 'DELIVERED'),
      ];

      expect(computeOverallOrderStatus(shipments)).toBe('RETURN_REQUESTED');
    });
  });

  describe('4. Backward Compatibility Synthesizer', () => {
    test('should synthesize shipments and status history for existing legacy orders', () => {
      const legacyOrder: IOrder = {
        _id: new ObjectId(),
        orderNumber: 'ORD-12345',
        userId: new ObjectId(),
        customerName: 'করিম খামারি',
        items: [
          {
            productId: new ObjectId(),
            name: 'উন্নত জাতের ধানের বীজ',
            price: 500,
            quantity: 2,
            sellerId: new ObjectId(),
          },
        ],
        totalAmount: 1080,
        shippingAddress: { address: 'বগুড়া সদর' },
        paymentMethod: 'cod',
        paymentStatus: 'unpaid',
        status: 'pending', // legacy lowercase
        createdAt: new Date('2026-01-01'),
      };

      const updated = ensureOrderCompatibility(legacyOrder);

      expect(updated.status).toBe('PENDING');
      expect(updated.shipments).toBeDefined();
      expect(updated.shipments?.length).toBe(1);
      expect(updated.shipments?.[0].status).toBe('PENDING');
      expect(updated.statusHistory).toBeDefined();
      expect(updated.statusHistory?.length).toBeGreaterThan(0);
    });
  });
});
