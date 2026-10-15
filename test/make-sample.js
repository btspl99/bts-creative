const { PDFDocument, StandardFonts, rgb } = require('pdf-lib');
const fs = require('fs');
(async () => {
  const d = await PDFDocument.create(); const f = await d.embedFont(StandardFonts.Helvetica); const fb = await d.embedFont(StandardFonts.HelveticaBold);
  const form = d.getForm();
  for (let i = 1; i <= 3; i++) {
    const p = d.addPage([595, 842]);
    p.drawText(`BTS Office Test Document — Page ${i}`, { x: 60, y: 770, size: 22, font: fb, color: rgb(0.1, 0.1, 0.3) });
    const para = 'The quick brown fox jumps over the lazy dog. Students can annotate, sign, and organize PDF pages for free.';
    for (let l = 0; l < 12; l++) p.drawText(para.slice(0, 80), { x: 60, y: 720 - l * 22, size: 12, font: f });
    p.drawRectangle({ x: 60, y: 300, width: 470, height: 100, color: rgb(0.9, 0.95, 1) });
    if (i === 1) {
      p.drawText('Name:', { x: 60, y: 250, size: 12, font: f });
      const tf = form.createTextField('student.name'); tf.addToPage(p, { x: 110, y: 242, width: 200, height: 22 });
      p.drawText('Agree:', { x: 330, y: 250, size: 12, font: f });
      const cb = form.createCheckBox('agree'); cb.addToPage(p, { x: 380, y: 244, width: 16, height: 16 });
    }
  }
  fs.writeFileSync(process.argv[2], await d.save());
})();
