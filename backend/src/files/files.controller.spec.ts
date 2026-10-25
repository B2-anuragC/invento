import { DEFAULT_ROLE_PERMISSIONS } from '@invento/shared';
import { FilesController } from './files.controller.js';

describe('Upload access', () => {
  const request = { user: { id: 'user-a' }, header: () => 'business-a' };
  it('rejects inactive membership before reading a file', async () => {
    const files = { read: vi.fn() };
    const prisma = { businessUser: { findUnique: vi.fn().mockResolvedValue({ isActive: false }) } };
    const controller = new FilesController(files as never, prisma as never, {} as never);
    await expect(controller.download(request as never, 'id', 'original', {} as never)).rejects.toThrow('access');
    expect(files.read).not.toHaveBeenCalled();
  });
  it('prevents members from uploading and from reading restricted purchase files', async () => {
    const files = { store: vi.fn(), read: vi.fn().mockResolvedValue({ data: Buffer.from('private'), manifest: { kind: 'purchase', name: 'bill.pdf' }, mimeType: 'application/pdf' }) };
    const prisma = { businessUser: { findUnique: vi.fn().mockResolvedValue({ businessId: 'business-a', isActive: true, business: { isActive: true }, role: 'MEMBER', roleDefinition: { permissions: DEFAULT_ROLE_PERMISSIONS.MEMBER.filter(p => p !== 'pricing.view') } }) }, business: { findUnique: vi.fn().mockResolvedValue({ membersCanViewPurchasePrice: false }) } };
    const controller = new FilesController(files as never, prisma as never, {} as never);
    const response = { set: vi.fn(), send: vi.fn() };
    await expect(controller.upload(request as never, { name: 'bill.pdf', mimeType: 'application/pdf', base64: 'QQ==', kind: 'purchase' })).rejects.toThrow('files.upload');
    expect(files.store).not.toHaveBeenCalled();
    await expect(controller.download(request as never, 'id', 'original', response as never)).rejects.toThrow('restricted');
    expect(response.send).not.toHaveBeenCalled();
  });
  it('rejects members before submitting or inspecting jobs', async () => {
    const jobs = { enqueue: vi.fn(), status: vi.fn() };
    const prisma = { businessUser: { findUnique: vi.fn().mockResolvedValue({ businessId: 'business-a', isActive: true, business: { isActive: true }, role: 'MEMBER', roleDefinition: { permissions: DEFAULT_ROLE_PERMISSIONS.MEMBER.filter(p => p !== 'pricing.view') } }) } };
    const controller = new FilesController({} as never, prisma as never, jobs as never);
    await expect(controller.enqueue(request as never, { name: 'image.png', mimeType: 'image/png', base64: 'QQ==', kind: 'product' })).rejects.toThrow('files.upload');
    await expect(controller.jobStatus(request as never, 'job')).rejects.toThrow('files.upload');
    expect(jobs.enqueue).not.toHaveBeenCalled();
    expect(jobs.status).not.toHaveBeenCalled();
  });

});
