/** Browsers cannot share a local file; their print dialog offers Save as PDF instead. */
export const canSharePdf = false;

let openFrame: HTMLIFrameElement | null = null;

/**
 * Prints the invoice from a hidden frame, so the browser prints the invoice
 * rather than the app page. The frame cannot run scripts; it is same-origin
 * only so this page can call print() on it.
 */
export function printInvoice(html: string): Promise<void> {
  return new Promise((resolve, reject) => {
    openFrame?.remove();
    const frame = document.createElement('iframe');
    openFrame = frame;
    const remove = () => {
      frame.remove();
      if (openFrame === frame) openFrame = null;
    };
    frame.setAttribute('sandbox', 'allow-same-origin allow-modals');
    frame.setAttribute('aria-hidden', 'true');
    frame.tabIndex = -1;
    frame.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0';
    frame.addEventListener('load', () => {
      const view = frame.contentWindow;
      if (!view) {
        remove();
        reject(new Error('Could not prepare the invoice for printing.'));
        return;
      }
      view.addEventListener('afterprint', () => setTimeout(remove), { once: true });
      try {
        view.focus();
        view.print();
        resolve();
      } catch (error) {
        remove();
        reject(error);
      }
    }, { once: true });
    frame.srcdoc = html;
    document.body.appendChild(frame);
  });
}

export async function shareInvoicePdf(): Promise<void> {
  throw new Error('Use Print, then choose Save as PDF.');
}
