import { BrowserMultiFormatReader } from 'https://esm.sh/@zxing/browser@0.1.5';
import { DecodeHintType, BarcodeFormat } from 'https://esm.sh/@zxing/library@0.21.3';
import { pushModal, goBack } from './nav.js';

// Focus on the barcode types found on groceries (plus QR). Restricting the list
// makes 1D retail barcodes decode faster and more reliably than trying everything.
const hints = new Map();
hints.set(DecodeHintType.POSSIBLE_FORMATS, [
  BarcodeFormat.EAN_13, BarcodeFormat.EAN_8,
  BarcodeFormat.UPC_A, BarcodeFormat.UPC_E,
  BarcodeFormat.CODE_128, BarcodeFormat.CODE_39,
  BarcodeFormat.ITF, BarcodeFormat.QR_CODE,
]);
hints.set(DecodeHintType.TRY_HARDER, true);

export function scanBarcode() {
  return new Promise((resolve) => {
    const overlay = document.createElement('div');
    overlay.className = 'scanner-overlay';
    overlay.innerHTML = `
      <div class="scanner-frame-wrap">
        <video class="scanner-video" playsinline muted></video>
        <div class="scanner-frame"></div>
      </div>
      <p class="scanner-status">Point the camera at a barcode</p>
      <button class="scanner-cancel" type="button">Cancel</button>`;
    document.body.appendChild(overlay);

    const video = overlay.querySelector('.scanner-video');
    const status = overlay.querySelector('.scanner-status');
    const cancelBtn = overlay.querySelector('.scanner-cancel');

    const reader = new BrowserMultiFormatReader(hints);
    let controls = null;
    let done = false;
    let resultValue = null;

    // The only place this overlay actually closes — cancel, a successful
    // scan, or hardware/browser Back all funnel here via finish()/goBack().
    pushModal(() => {
      done = true;
      try { controls && controls.stop(); } catch { /* already stopped */ }
      overlay.remove();
      resolve(resultValue);
    });

    const finish = (value) => {
      if (done) return;
      done = true;
      resultValue = value;
      goBack();
    };

    cancelBtn.onclick = () => finish(null);

    reader.decodeFromConstraints(
      {
        video: {
          facingMode: { ideal: 'environment' },
          width: { ideal: 1280 },
          height: { ideal: 720 },
        },
      },
      video,
      (result, _err, ctrl) => {
        controls = ctrl || controls;
        if (result) {
          console.log('Barcode detected:', result.getText());
          finish(result.getText());
        }
      }
    ).then((c) => {
      controls = c;
      console.log('Scanner started — point at a barcode.');
      if (done) { try { c.stop(); } catch { /* cancelled at startup */ } }
    }).catch((err) => {
      console.error('Scanner failed to start:', err);
      const name = err && err.name;
      status.textContent =
        name === 'NotAllowedError' ? 'Camera permission was denied. Type the barcode instead.' :
        name === 'NotFoundError'  ? 'No camera found. Type the barcode instead.' :
                                    'Could not start the camera. Type the barcode instead.';
      status.classList.add('scanner-error');
      cancelBtn.textContent = 'Close';
    });
  });
}