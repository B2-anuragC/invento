import { FilesController } from './files.controller.js';

describe('Upload access', () => {
  const request = { user: { id: 'user-a' }, header: () => 'business-a' };
  it('rejects inactive membership before reading a file', async () => {
    const files = { read: vi.fn() };
    const prisma = { businessUser: { findUnique: vi.fn().mockResolvedValue({ isActive: false }) } };
    const controller = new FilesController(files as never, prisma as never);
    await expect(controller.download(request as never, 'id', 'original', {} as never)).rejects.toThrow('access');
    expect(files.read).not.toHaveBeenCalled();
  });
  it('prevents members from uploading and from reading restricted purchase files', async () => {
    const files = { store: vi.fn(), read: vi.fn().mockResolvedValue({ data: Buffer.from('private'), manifest: { kind: 'purchase', name: 'bill.pdf' }, mimeType: 'application/pdf' }) };
    const prisma = { businessUser: { findUnique: vi.fn().mockResolvedValue({ businessId: 'business-a', isActive: true, role: 'MEMBER' }) }, business: { findUnique: vi.fn().mockResolvedValue({ membersCanViewPurchasePrice: false }) } };
    const controller = new FilesController(files as never, prisma as never);
    const response = { set: vi.fn(), send: vi.fn() };
    await expect(controller.upload(request as never, { name: 'bill.pdf', mimeType: 'application/pdf', base64: 'QQ==', kind: 'purchase' })).rejects.toThrow('administrators');
    expect(files.store).not.toHaveBeenCalled();
    await expect(controller.download(request as never, 'id', 'original', response as never)).rejects.toThrow('restricted');
    expect(response.send).not.toHaveBeenCalled();
  });
});
