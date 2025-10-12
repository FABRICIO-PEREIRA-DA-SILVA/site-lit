// functions/index.js
const { onRequest } = require("firebase-functions/v2/https");
const { setGlobalOptions } = require("firebase-functions/v2");
const logger = require("firebase-functions/logger");
const chromium = require("@sparticuz/chromium");
const puppeteer = require("puppeteer-core");
const { PDFDocument } = require("pdf-lib");
const cors = require("cors")({ origin: true });

// Configurações globais para todas as funções neste arquivo
setGlobalOptions({ timeoutSeconds: 300, memory: "1GiB", region: "us-central1" });

// ===================================================================================
// FUNÇÃO AUXILIAR REUTILIZÁVEL PARA CONVERTER UM ÚNICO HTML EM UM BUFFER DE PDF
// ===================================================================================
const convertHtmlToPdfBuffer = async (htmlContent, browser) => {
  const page = await browser.newPage();
  try {
    await page.setContent(htmlContent, { waitUntil: "domcontentloaded" });
    await new Promise(resolve => setTimeout(resolve, 300)); // Pausa de segurança
    const pdfBuffer = await page.pdf({
      format: "A4",
      printBackground: true,
      margin: {
        top: "10mm",
        right: "10mm",
        bottom: "10mm",
        left: "10mm",
      },
      timeout: 120000
    });
    return pdfBuffer;
  } finally {
    await page.close();
  }
};

// ===================================================================================
// SUA FUNÇÃO ORIGINAL PARA GERAR UM ÚNICO PDF (NÃO FOI ALTERADA)
// ===================================================================================
exports.generatePdf = onRequest({ cors: true }, async (req, res) => {
  if (req.method !== "POST") {
    res.writeHead(405, { 'Content-Type': 'text/plain' });
    return res.end("Method Not Allowed");
  }

  let browser = null;
  try {
    const { htmlContent, signatureData } = req.body;
    if (!htmlContent) {
      res.writeHead(400, { 'Content-Type': 'text/plain' });
      return res.end("htmlContent is required");
    }

    let finalHtml = htmlContent;
    if (signatureData) {
      const signaturePlaceholder = "<!-- SIGNATURE_PLACEHOLDER -->";
      const signatureImageTag = `<img src="${signatureData}" style="max-width: 200px !important; max-height: 25px !important; object-fit: contain !important; display: block;">`;
      finalHtml = finalHtml.replace(signaturePlaceholder, signatureImageTag);
    }

    browser = await puppeteer.launch({
      args: chromium.args,
      defaultViewport: chromium.defaultViewport,
      executablePath: await chromium.executablePath(),
      headless: chromium.headless,
      ignoreHTTPSErrors: true,
    });

    // Usa a nova função auxiliar
    const pdfBuffer = await convertHtmlToPdfBuffer(finalHtml, browser);

    logger.info(`Buffer do PDF gerado com sucesso. Tamanho: ${pdfBuffer.length} bytes.`);
    if (pdfBuffer.length === 0) {
      throw new Error("O buffer do PDF foi gerado com tamanho zero.");
    }

    res.writeHead(200, {
      'Content-Type': 'application/pdf',
      'Content-Length': pdfBuffer.length,
      'Content-Disposition': 'attachment; filename="boletim.pdf"',
    });
    res.end(pdfBuffer);

  } catch (error) {
    logger.error("Erro crítico ao gerar o PDF:", error);
    res.writeHead(500, { 'Content-Type': 'text/plain' });
    res.end("Error generating PDF: " + error.message);
  } finally {
    if (browser !== null) {
      await browser.close();
    }
  }
});

// ===================================================================================
// NOVA FUNÇÃO PARA JUNTAR MÚLTIPLOS PDFS
// ===================================================================================
exports.mergePdfs = onRequest({ cors: true }, async (req, res) => {
  if (req.method !== "POST") {
    res.writeHead(405, { 'Content-Type': 'text/plain' });
    return res.end("Method Not Allowed");
  }

  const { htmlContents } = req.body;

  if (!htmlContents || !Array.isArray(htmlContents) || htmlContents.length === 0) {
    res.writeHead(400, { 'Content-Type': 'text/plain' });
    return res.end('Corpo da requisição inválido. É esperado um array "htmlContents".');
  }

  let browser = null;
  try {
    browser = await puppeteer.launch({
      args: chromium.args,
      defaultViewport: chromium.defaultViewport,
      executablePath: await chromium.executablePath(),
      headless: chromium.headless,
      ignoreHTTPSErrors: true,
    });

    // 1. Gera todos os PDFs em paralelo usando a função auxiliar
    const pdfBuffers = await Promise.all(
      htmlContents.map(html => convertHtmlToPdfBuffer(html, browser))
    );

    // 2. Une os PDFs gerados
    const mergedPdf = await PDFDocument.create();
    for (const pdfBuffer of pdfBuffers) {
      if (pdfBuffer.length > 0) {
        const pdf = await PDFDocument.load(pdfBuffer);
        const copiedPages = await mergedPdf.copyPages(pdf, pdf.getPageIndices());
        copiedPages.forEach((page) => mergedPdf.addPage(page));
      }
    }

    // 3. Salva o PDF final unificado
    const mergedPdfBytes = await mergedPdf.save();

    // 4. Envia o PDF unificado como resposta
    res.writeHead(200, {
      'Content-Type': 'application/pdf',
      'Content-Length': mergedPdfBytes.length,
      'Content-Disposition': 'attachment; filename="boletins_unificados.pdf"',
    });
    res.end(Buffer.from(mergedPdfBytes));

  } catch (error) {
    logger.error("Erro ao gerar ou unir os PDFs:", error);
    res.writeHead(500, { 'Content-Type': 'text/plain' });
    res.end("Ocorreu um erro interno ao processar os PDFs: " + error.message);
  } finally {
    if (browser !== null) {
      await browser.close();
    }
  }
});
