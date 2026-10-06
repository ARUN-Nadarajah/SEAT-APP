import { fetchReceiptById, fetchReservationReceipt } from '../receipts.api';
import { apiClient } from '../client';

jest.mock('../client', () => ({
  apiClient: {
    get: jest.fn(),
  },
}));

describe('Receipts API Client', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('fetchReservationReceipt calls GET /reservations/:id/receipt', async () => {
    const mockEnvelope = {
      status: 'success',
      data: {
        receipt: {
          id: 'rcpt-123',
          receiptNumber: 'REC-RES-1001-V1',
          bookingReference: 'RES-1001',
          version: 1,
          status: 'current',
        },
        versions: [],
      },
    };

    (apiClient.get as jest.Mock).mockResolvedValueOnce({ data: mockEnvelope });

    const result = await fetchReservationReceipt('res-1001');

    expect(apiClient.get).toHaveBeenCalledWith('/reservations/res-1001/receipt');
    expect(result).toEqual(mockEnvelope);
  });

  test('fetchReceiptById calls GET /receipts/:id', async () => {
    const mockEnvelope = {
      status: 'success',
      data: {
        receipt: {
          id: 'rcpt-123',
          receiptNumber: 'REC-RES-1001-V1',
          version: 1,
        },
        versions: [],
      },
    };

    (apiClient.get as jest.Mock).mockResolvedValueOnce({ data: mockEnvelope });

    const result = await fetchReceiptById('REC-RES-1001-V1');

    expect(apiClient.get).toHaveBeenCalledWith('/receipts/REC-RES-1001-V1');
    expect(result).toEqual(mockEnvelope);
  });
});

