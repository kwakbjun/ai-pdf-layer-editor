import React, { useState, useRef, useEffect } from 'react';
import { Upload, FileType, Download, Trash2, CheckSquare, Square, Loader2, Presentation, Layers, Info, BrainCircuit, ScanText, ToggleLeft, ToggleRight } from 'lucide-react';

// External scripts for PDF, PPTX, and OCR processing
const PDFJS_URL = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js';
const PDFJS_WORKER_URL = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
const PPTXGEN_URL = 'https://cdn.jsdelivr.net/gh/gitbrent/pptxgenjs@3.12.0/dist/pptxgen.bundle.js';
const TESSERACT_URL = 'https://cdn.jsdelivr.net/npm/tesseract.js@5/dist/tesseract.min.js';

const App = () => {
  const [pdfFile, setPdfFile] = useState(null);
  const [pages, setPages] = useState([]);
  const [selectedPageIds, setSelectedPageIds] = useState(new Set());
  const [isLoading, setIsLoading] = useState(false);
  const [status, setStatus] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [useOcr, setUseOcr] = useState(true); // OCR 사용 여부 상태
  const fileInputRef = useRef(null);

  useEffect(() => {
    const loadScripts = async () => {
      const scripts = [PDFJS_URL, PPTXGEN_URL, TESSERACT_URL];
      scripts.forEach(src => {
        if (!document.querySelector(`script[src="${src}"]`)) {
          const script = document.createElement('script');
          script.src = src;
          script.async = true;
          document.head.appendChild(script);
        }
      });
    };
    loadScripts();
  }, []);

  const onFileChange = async (e) => {
    const file = e.target.files[0];
    if (file && file.type === 'application/pdf') {
      processPdf(file);
    }
  };

  const processPdf = async (file) => {
    setIsLoading(true);
    setStatus('PDF 문서를 불러오는 중...');
    setPdfFile(file);
    
    try {
      const arrayBuffer = await file.arrayBuffer();
      const pdfjsLib = window.pdfjsLib;
      pdfjsLib.GlobalWorkerOptions.workerSrc = PDFJS_WORKER_URL;

      const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
      const numPages = pdf.numPages;
      const loadedPages = [];
      const initialSelected = new Set();

      for (let i = 1; i <= numPages; i++) {
        const page = await pdf.getPage(i);
        const viewport = page.getViewport({ scale: 1.2 });
        const canvas = document.createElement('canvas');
        const context = canvas.getContext('2d');
        canvas.height = viewport.height;
        canvas.width = viewport.width;

        await page.render({ canvasContext: context, viewport }).promise;
        
        loadedPages.push({
          id: i,
          preview: canvas.toDataURL('image/png'),
          width: viewport.width,
          height: viewport.height,
          originalPage: page
        });
        initialSelected.add(i);
        setStatus(`페이지 스캔 중: ${i}/${numPages}`);
      }

      setPages(loadedPages);
      setSelectedPageIds(initialSelected);
    } catch (error) {
      console.error('PDF 처리 오류:', error);
      alert('PDF 분석 중 오류가 발생했습니다.');
    } finally {
      setIsLoading(false);
      setStatus('');
    }
  };

  const convertToPptx = async () => {
    if (selectedPageIds.size === 0) return;
    
    setIsProcessing(true);
    const pptx = new window.PptxGenJS();
    pptx.layout = 'LAYOUT_WIDE'; 
    const PPTX_WIDTH = 13.33;
    const PPTX_HEIGHT = 7.5;

    try {
      let ocrWorker = null;
      // 1. OCR 옵션이 켜져 있을 때만 워커 초기화
      if (useOcr) {
        setStatus('AI OCR 엔진 초기화 중 (한국어/영어)...');
        ocrWorker = await window.Tesseract.createWorker('kor+eng');
      }

      const selectedPages = Array.from(selectedPageIds).sort((a, b) => a - b);
      
      for (let idx = 0; idx < selectedPages.length; idx++) {
        const pageId = selectedPages[idx];
        const pageData = pages.find(p => p.id === pageId);
        const page = pageData.originalPage;
        const slide = pptx.addSlide();

        setStatus(`슬라이드 ${pageId} 레이어 분석 중...`);

        // 배경 이미지 삽입
        slide.addImage({
            data: pageData.preview,
            x: 0, y: 0, w: '100%', h: '100%',
        });

        // 텍스트 추출 시도
        const textContent = await page.getTextContent();
        const viewport = page.getViewport({ scale: 1.0 });

        if (textContent.items.length > 0) {
          // 디지털 텍스트가 있는 경우 처리
          textContent.items.forEach(item => {
            const { str, transform, width } = item;
            if (!str.trim()) return;
            const pdfX = transform[4];
            const pdfY = transform[5];
            const xPos = (pdfX / viewport.width) * PPTX_WIDTH;
            const yPos = ((viewport.height - pdfY - (transform[0] || 12)) / viewport.height) * PPTX_HEIGHT;
            const fontSize = Math.sqrt(transform[0]**2 + transform[1]**2);
            const boxWidth = (width / viewport.width) * PPTX_WIDTH;

            slide.addText(str, {
              x: xPos, y: yPos, w: Math.max(boxWidth * 1.1, 0.5),
              fontSize: fontSize * 0.9, color: '363636', fontFace: 'Arial', transparent: true
            });
          });
        } else if (useOcr && ocrWorker) {
          // 디지털 텍스트가 없고 OCR 옵션이 켜져 있는 경우 AI 모드 작동
          setStatus(`슬라이드 ${pageId}: AI 이미지 글자 분석 중...`);
          const ocrViewport = page.getViewport({ scale: 2.0 });
          const canvas = document.createElement('canvas');
          canvas.width = ocrViewport.width;
          canvas.height = ocrViewport.height;
          const ctx = canvas.getContext('2d');
          await page.render({ canvasContext: ctx, viewport: ocrViewport }).promise;

          const { data } = await ocrWorker.recognize(canvas);
          
          data.lines.forEach(line => {
            if (line.confidence < 30) return;
            const { x0, y0, x1, y1 } = line.bbox;
            const textWidth = x1 - x0;
            const textHeight = y1 - y0;
            const xPos = (x0 / ocrViewport.width) * PPTX_WIDTH;
            const yPos = (y0 / ocrViewport.height) * PPTX_HEIGHT;
            const wPos = (textWidth / ocrViewport.width) * PPTX_WIDTH;
            const hPos = (textHeight / ocrViewport.height) * PPTX_HEIGHT;

            slide.addText(line.text.trim(), {
              x: xPos, y: yPos, w: Math.max(wPos * 1.05, 1), h: hPos,
              fontSize: (hPos * 72) * 0.7, color: '000000', fontFace: 'Arial', transparent: true
            });
          });
        }
      }

      if (ocrWorker) await ocrWorker.terminate();

      setStatus('PPTX 파일 저장 중...');
      const fileName = pdfFile.name.replace('.pdf', '') + '_Editable.pptx';
      await pptx.writeFile({ fileName });
    } catch (error) {
      console.error('PPTX 생성 오류:', error);
      alert('변환 중 오류가 발생했습니다.');
    } finally {
      setIsProcessing(false);
      setStatus('');
    }
  };

  const togglePageSelection = (id) => {
    const newSelection = new Set(selectedPageIds);
    if (newSelection.has(id)) newSelection.delete(id);
    else newSelection.add(id);
    setSelectedPageIds(newSelection);
  };

  return (
    <div className="min-h-screen bg-[#f8fafc] p-4 md:p-8 font-sans text-slate-900">
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <header className="mb-10 flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div className="flex items-center gap-4">
            <div className="bg-gradient-to-br from-orange-500 to-red-600 p-3 rounded-2xl text-white shadow-xl shadow-orange-200">
              <BrainCircuit size={32} />
            </div>
            <div>
              <h1 className="text-3xl font-black text-slate-800 tracking-tight">AI PDF Layer Editor</h1>
              <p className="text-slate-500 font-medium">슬라이드를 선택하고 텍스트 레이어를 추출하세요.</p>
            </div>
          </div>
          
          {pdfFile && (
            <div className="flex items-center gap-4 bg-white p-2 rounded-2xl shadow-sm border border-slate-100">
                {/* OCR Toggle Button */}
                <div className="flex flex-col px-3 border-r border-slate-100">
                  <span className="text-[10px] font-black text-slate-400 uppercase mb-1">AI Mode</span>
                  <button 
                    onClick={() => setUseOcr(!useOcr)}
                    className={`flex items-center gap-2 px-3 py-1.5 rounded-xl text-xs font-bold transition-all duration-300 ${
                      useOcr ? 'bg-orange-600 text-white shadow-md' : 'bg-slate-100 text-slate-400 hover:bg-slate-200'
                    }`}
                  >
                    {useOcr ? <ToggleRight size={18} /> : <ToggleLeft size={18} />}
                    AI OCR {useOcr ? '사용 중' : '사용 안 함'}
                  </button>
                </div>

                <div className="flex items-center gap-2">
                  <button 
                    onClick={() => {setPdfFile(null); setPages([]);}}
                    className="p-3 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-xl transition-all"
                  >
                    <Trash2 size={20} />
                  </button>
                  <button 
                    disabled={selectedPageIds.size === 0 || isProcessing}
                    onClick={convertToPptx}
                    className="px-6 py-3 bg-slate-900 text-white rounded-xl shadow-lg hover:bg-slate-800 hover:-translate-y-0.5 transition-all text-sm font-bold flex items-center gap-2 disabled:opacity-30 disabled:translate-y-0"
                  >
                    {isProcessing ? <Loader2 size={18} className="animate-spin" /> : <Download size={18} />}
                    PPTX 생성하기
                  </button>
                </div>
            </div>
          )}
        </header>

        {!pdfFile ? (
          <div 
            onClick={() => fileInputRef.current?.click()}
            className="group border-2 border-dashed border-slate-300 rounded-[2.5rem] p-20 bg-white hover:border-orange-500 hover:shadow-2xl hover:shadow-orange-100 transition-all cursor-pointer flex flex-col items-center justify-center"
          >
            <input type="file" ref={fileInputRef} onChange={onFileChange} accept=".pdf" className="hidden" />
            <div className="w-24 h-24 bg-orange-50 rounded-[2rem] flex items-center justify-center mb-6 group-hover:scale-110 transition-transform duration-500">
                <Upload className="text-orange-600" size={40} />
            </div>
            <h2 className="text-2xl font-black mb-2 text-slate-800">PDF 파일을 선택하세요</h2>
            <p className="text-slate-400 font-medium">파일을 드래그하거나 클릭하여 시작하세요</p>
          </div>
        ) : (
          <div className="space-y-8">
            {/* Status Indicator */}
            {status && (
              <div className="bg-slate-900 text-white px-6 py-4 rounded-2xl shadow-xl flex items-center gap-4 border border-white/10 animate-in fade-in slide-in-from-top-4 duration-300">
                <Loader2 size={20} className="animate-spin text-orange-500" />
                <span className="font-bold">{status}</span>
              </div>
            )}

            <div className="flex items-center justify-between px-2">
                <h3 className="text-lg font-bold text-slate-700">슬라이드 미리보기 ({pages.length})</h3>
                <div className="flex gap-4 bg-white p-1 rounded-xl border border-slate-200">
                    <button onClick={() => setSelectedPageIds(new Set(pages.map(p => p.id)))} className="px-3 py-1.5 text-xs font-bold text-slate-600 hover:bg-slate-50 rounded-lg">전체 선택</button>
                    <button onClick={() => setSelectedPageIds(new Set())} className="px-3 py-1.5 text-xs font-bold text-slate-400 hover:bg-slate-50 rounded-lg">해제</button>
                </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-8 pb-20">
              {pages.map((page) => (
                <div 
                  key={page.id}
                  onClick={() => togglePageSelection(page.id)}
                  className={`group relative rounded-[2rem] transition-all duration-300 cursor-pointer ${
                    selectedPageIds.has(page.id) 
                    ? 'ring-[6px] ring-orange-500 ring-offset-4' 
                    : 'hover:translate-y-[-4px]'
                  }`}
                >
                  <div className="bg-white rounded-[1.8rem] shadow-xl border border-slate-100 overflow-hidden aspect-[4/3] relative">
                    <img 
                      src={page.preview} 
                      alt={`Slide ${page.id}`} 
                      className="w-full h-full object-contain"
                    />
                    <div className={`absolute top-5 left-5 w-8 h-8 rounded-xl flex items-center justify-center font-black text-xs shadow-md border transition-all ${
                        selectedPageIds.has(page.id) ? 'bg-orange-600 border-orange-400 text-white' : 'bg-white border-slate-100 text-slate-400'
                    }`}>
                        {page.id}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="mt-8 p-8 bg-white rounded-[2rem] border border-slate-100 shadow-sm flex flex-col md:flex-row gap-8 items-center">
            <div className={`p-5 rounded-3xl transition-colors ${useOcr ? 'bg-orange-50 text-orange-600' : 'bg-slate-50 text-slate-400'}`}>
                <BrainCircuit size={48} />
            </div>
            <div>
                <h4 className="text-xl font-black mb-2 text-slate-800">AI OCR (광학 문자 인식) 설정 안내</h4>
                <p className="text-slate-500 text-sm leading-relaxed mb-4">
                    <strong>AI OCR ON:</strong> 글자가 선택되지 않는 스캔된 PDF나 이미지 문서에서도 글자를 읽어내 편집 가능한 텍스트 박스로 만들어줍니다. (변환 시간 약 3~5초 추가 소요)
                </p>
                <p className="text-slate-500 text-sm leading-relaxed">
                    <strong>AI OCR OFF:</strong> 일반적인 디지털 PDF(글자 선택이 가능한 파일)를 변환할 때 사용하세요. 이미지 속 글자는 분석하지 않으므로 변환 속도가 매우 빠릅니다.
                </p>
            </div>
        </div>
      </div>
    </div>
  );
};

export default App;