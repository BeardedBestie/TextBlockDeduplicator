import React, { useState, useEffect, useRef } from 'react';
import { Sun, Moon, Upload, FileText, Download, Copy, RefreshCw, Settings, ChevronDown, ChevronUp } from 'lucide-react';

function App() {
  // State management
  const [originalText, setOriginalText] = useState('');
  const [processedText, setProcessedText] = useState('');
  const [fileName, setFileName] = useState('');
  const [similarity, setSimilarity] = useState(0.7);
  const [minBlockSize, setMinBlockSize] = useState(30);
  const [algorithm, setAlgorithm] = useState('jaccard');
  const [blockSplitMethod, setBlockSplitMethod] = useState('paragraph');
  const [progress, setProgress] = useState(0);
  const [stats, setStats] = useState({ original: 0, processed: 0, removed: 0, duplicatesFound: 0 });
  const [isProcessing, setIsProcessing] = useState(false);
  const [theme, setTheme] = useState('light');
  const [batchMode, setBatchMode] = useState(false);
  const [batchFiles, setBatchFiles] = useState<File[]>([]);
  const [batchProgress, setBatchProgress] = useState({ current: 0, total: 0 });
  const [preservePatterns, setPreservePatterns] = useState('');
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [showPreview, setShowPreview] = useState(false);
  const [previewDuplicates, setPreviewDuplicates] = useState<any[]>([]);
  const [processingHistory, setProcessingHistory] = useState<any[]>([]);
  
  // Refs
  const fileInputRef = useRef<HTMLInputElement>(null);
  const batchInputRef = useRef<HTMLInputElement>(null);
  
  // Instagram-inspired color palette
  const colors = {
    light: {
      primary: '#405DE6',     // Instagram blue
      secondary: '#5851DB',   // Instagram purple
      accent: '#E1306C',      // Instagram pink/red
      gradient1: '#FCAF45',   // Instagram yellow
      gradient2: '#FD1D1D',   // Instagram orange/red
      text: '#262626',        // Instagram dark text
      textSecondary: '#8e8e8e',
      background: '#FFFFFF',
      backgroundSecondary: '#FAFAFA',
      border: '#DBDBDB'
    },
    dark: {
      primary: '#405DE6',
      secondary: '#5851DB',
      accent: '#E1306C',
      gradient1: '#FCAF45',
      gradient2: '#FD1D1D',
      text: '#FAFAFA',
      textSecondary: '#8e8e8e',
      background: '#121212',
      backgroundSecondary: '#1F1F1F',
      border: '#383838'
    }
  };
  
  const currentColors = colors[theme];
  
  // Handle theme toggle
  const toggleTheme = () => {
    setTheme(theme === 'light' ? 'dark' : 'light');
  };
  
  // Batch file handling
  const handleBatchFileUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    if (!event.target.files) return;
    const files = Array.from(event.target.files);
    setBatchFiles(files);
    setBatchProgress({ current: 0, total: files.length });
  };
  
  // Process batch files
  const processBatchFiles = async () => {
    if (batchFiles.length === 0) return;
    
    setIsProcessing(true);
    setBatchProgress({ ...batchProgress, current: 0 });
    
    const results = [];
    for (let i = 0; i < batchFiles.length; i++) {
      const file = batchFiles[i];
      setBatchProgress({ ...batchProgress, current: i + 1 });
      
      try {
        const text = await readFileAsText(file);
        const processed = await deduplicateText(text);
        
        // Save file
        const blob = new Blob([processed], { type: 'text/plain' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `deduplicated_${file.name}`;
        a.click();
        URL.revokeObjectURL(url);
        
        results.push({
          fileName: file.name,
          originalSize: text.length,
          processedSize: processed.length,
          reduction: ((text.length - processed.length) / text.length * 100).toFixed(2)
        });
      } catch (error) {
        console.error(`Error processing file ${file.name}:`, error);
        results.push({
          fileName: file.name,
          error: error instanceof Error ? error.message : 'Unknown error'
        });
      }
    }
    
    // Update history
    setProcessingHistory([...processingHistory, {
      timestamp: new Date().toISOString(),
      files: results
    }]);
    
    setIsProcessing(false);
  };
  
  // Handle file upload
  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    if (!event.target.files || event.target.files.length === 0) return;
    
    const file = event.target.files[0];
    if (!file) return;
    
    setFileName(file.name);
    
    try {
      const text = await readFileAsText(file);
      setOriginalText(text);
      setProcessedText('');
      setStats({
        original: text.length,
        processed: 0,
        removed: 0,
        duplicatesFound: 0
      });
      
      // Quick preview of potential duplicates
      if (text.length > 0) {
        generateDuplicatePreview(text);
      }
    } catch (error) {
      console.error('Error reading file:', error);
    }
  };
  
  // Generate preview of potential duplicates
  const generateDuplicatePreview = (text: string) => {
    // Only show preview for manageable text sizes
    if (text.length > 1000000) return;
    
    const blocks = splitIntoBlocks(text, blockSplitMethod);
    
    // Find some examples of similar blocks
    const duplicateExamples = [];
    const seenBlockSignatures = new Map();
    
    blocks.forEach((block) => {
      if (block.length < minBlockSize) return;
      
      const blockSignature = simplifyText(block);
      
      for (const [signature, originalBlock] of seenBlockSignatures.entries()) {
        const similarityScore = calculateSimilarity(blockSignature, signature, algorithm);
        if (similarityScore >= similarity) {
          duplicateExamples.push({
            original: originalBlock,
            duplicate: block,
            similarity: similarityScore
          });
          return;
        }
      }
      
      seenBlockSignatures.set(blockSignature, block);
    });
    
    // Limit to top 5 examples
    setPreviewDuplicates(duplicateExamples.slice(0, 5));
    setShowPreview(duplicateExamples.length > 0);
  };
  
  // Read file as text
  const readFileAsText = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        if (e.target && typeof e.target.result === 'string') {
          resolve(e.target.result);
        } else {
          reject(new Error('Failed to read file'));
        }
      };
      reader.onerror = (e) => reject(new Error('Error reading file'));
      reader.readAsText(file);
    });
  };
  
  // Process text with Web Worker for larger files
  const deduplicateText = async (text: string): Promise<string> => {
    return new Promise((resolve, reject) => {
      if (text.length < 100000) {
        // For smaller texts, process directly
        const result = processTextSync(text);
        resolve(result);
      } else {
        // For larger texts, simulate a worker thread
        setProgress(0);
        setTimeout(() => {
          try {
            const result = processTextSync(text);
            resolve(result);
          } catch (error) {
            reject(error);
          }
        }, 100);
      }
    });
  };
  
  // Process text synchronously
  const processTextSync = (text: string): string => {
    // Split text into blocks using the selected method
    const blocks = splitIntoBlocks(text, blockSplitMethod);
    const totalBlocks = blocks.length;
    const uniqueBlocks: string[] = [];
    
    // Track which blocks we've already seen (similar enough)
    const seenBlockSignatures = new Map();
    let duplicatesFound = 0;
    
    // Compile preserve patterns if any
    let preserveRegexes: RegExp[] = [];
    if (preservePatterns.trim()) {
      preserveRegexes = preservePatterns
        .split('\n')
        .filter(pattern => pattern.trim().length > 0)
        .map(pattern => new RegExp(pattern.trim(), 'i'));
    }
    
    blocks.forEach((block, index) => {
      // Update progress periodically
      if (index % 20 === 0) {
        setProgress(Math.floor(((index + 1) / totalBlocks) * 100));
      }
      
      // Check if block should be preserved based on patterns
      const shouldPreserve = preserveRegexes.some(regex => regex.test(block));
      if (shouldPreserve) {
        uniqueBlocks.push(block);
        return;
      }
      
      // Skip very small blocks (likely not meaningful repetitive content)
      if (block.length < minBlockSize) {
        uniqueBlocks.push(block);
        return;
      }
      
      // Create a signature for the block
      const blockSignature = simplifyText(block);
      
      // Check if we've seen a similar block
      let isDuplicate = false;
      
      for (const [signature, _] of seenBlockSignatures.entries()) {
        const similarityScore = calculateSimilarity(blockSignature, signature, algorithm);
        if (similarityScore >= similarity) {
          isDuplicate = true;
          duplicatesFound++;
          break;
        }
      }
      
      if (!isDuplicate) {
        uniqueBlocks.push(block);
        seenBlockSignatures.set(blockSignature, true);
      }
    });
    
    // Join blocks back together
    const result = uniqueBlocks.join('\n\n');
    
    // Update stats
    setStats({
      original: text.length,
      processed: result.length,
      removed: text.length - result.length,
      duplicatesFound
    });
    
    return result;
  };
  
  // Process text to remove duplicate blocks
  const processText = async () => {
    if (!originalText) return;
    
    setIsProcessing(true);
    setProgress(0);
    
    try {
      const result = await deduplicateText(originalText);
      setProcessedText(result);
      
      // Add to history
      setProcessingHistory([...processingHistory, {
        timestamp: new Date().toISOString(),
        fileName,
        originalSize: originalText.length,
        processedSize: result.length,
        reduction: ((originalText.length - result.length) / originalText.length * 100).toFixed(2)
      }]);
      
    } catch (error) {
      console.error('Error processing text:', error);
    } finally {
      setIsProcessing(false);
    }
  };
  
  // Split text into logical blocks based on selected method
  const splitIntoBlocks = (text: string, method: string): string[] => {
    switch (method) {
      case 'paragraph':
        // Split by double newline (paragraphs)
        return text.split(/\n\s*\n/).filter(block => block.trim().length > 0);
      
      case 'sentence':
        // Split by sentences
        return text.match(/[^.!?]+[.!?]+/g) || [];
      
      case 'hybrid':
        // First split by paragraphs
        const paragraphs = text.split(/\n\s*\n/);
        
        // Then process large paragraphs further
        const blocks: string[] = [];
        paragraphs.forEach(paragraph => {
          if (paragraph.length > 500) {
            // Try to split by sentences for large paragraphs
            const sentences = paragraph.match(/[^.!?]+[.!?]+/g) || [paragraph];
            blocks.push(...sentences);
          } else {
            blocks.push(paragraph);
          }
        });
        
        return blocks.filter(block => block.trim().length > 0);
      
      case 'sized':
        // Fixed size chunks (with some intelligence around not breaking mid-sentence)
        const chunkSize = 200;
        const chunks: string[] = [];
        let currentChunk = '';
        
        // Simple sentence regex
        const sentences = text.match(/[^.!?]+[.!?]+/g) || [];
        
        sentences.forEach(sentence => {
          if (currentChunk.length + sentence.length > chunkSize) {
            chunks.push(currentChunk);
            currentChunk = sentence;
          } else {
            currentChunk += ' ' + sentence;
          }
        });
        
        if (currentChunk.trim().length > 0) {
          chunks.push(currentChunk);
        }
        
        return chunks.filter(chunk => chunk.trim().length > 0);
        
      default:
        return text.split(/\n\s*\n/).filter(block => block.trim().length > 0);
    }
  };
  
  // Simplify text for comparison (remove extra spaces, lowercase, etc.)
  const simplifyText = (text: string): string => {
    return text
      .toLowerCase()
      .replace(/\s+/g, ' ')
      .replace(/[^\w\s]/g, '')
      .trim();
  };
  
  // Calculate similarity between two text strings
  const calculateSimilarity = (str1: string, str2: string, algorithm: string): number => {
    switch (algorithm) {
      case 'jaccard':
        // Jaccard similarity (set-based)
        const set1 = new Set(str1.split(' '));
        const set2 = new Set(str2.split(' '));
        
        const intersection = new Set([...set1].filter(word => set2.has(word)));
        const union = new Set([...set1, ...set2]);
        
        return union.size === 0 ? 0 : intersection.size / union.size;
      
      case 'cosine':
        // Cosine similarity (better for longer texts)
        const words1 = str1.split(' ');
        const words2 = str2.split(' ');
        
        // Count word frequencies
        const freqMap1: Record<string, number> = {};
        const freqMap2: Record<string, number> = {};
        
        words1.forEach(word => {
          freqMap1[word] = (freqMap1[word] || 0) + 1;
        });
        
        words2.forEach(word => {
          freqMap2[word] = (freqMap2[word] || 0) + 1;
        });
        
        // Calculate dot product
        let dotProduct = 0;
        for (const word in freqMap1) {
          if (freqMap2[word]) {
            dotProduct += freqMap1[word] * freqMap2[word];
          }
        }
        
        // Calculate magnitudes
        const mag1 = Math.sqrt(Object.values(freqMap1).reduce((sum, count) => sum + count * count, 0));
        const mag2 = Math.sqrt(Object.values(freqMap2).reduce((sum, count) => sum + count * count, 0));
        
        if (mag1 === 0 || mag2 === 0) return 0;
        return dotProduct / (mag1 * mag2);
      
      case 'levenshtein':
        // Normalized Levenshtein distance (better for short texts)
        const distance = levenshteinDistance(str1, str2);
        const maxLength = Math.max(str1.length, str2.length);
        return maxLength === 0 ? 1 : 1 - distance / maxLength;
      
      default:
        // Default to Jaccard
        const defaultSet1 = new Set(str1.split(' '));
        const defaultSet2 = new Set(str2.split(' '));
        
        const defaultIntersection = new Set([...defaultSet1].filter(word => defaultSet2.has(word)));
        const defaultUnion = new Set([...defaultSet1, ...defaultSet2]);
        
        return defaultUnion.size === 0 ? 0 : defaultIntersection.size / defaultUnion.size;
    }
  };
  
  // Levenshtein distance calculation for similarity algorithm
  const levenshteinDistance = (str1: string, str2: string): number => {
    const m = str1.length;
    const n = str2.length;
    
    // Create matrix
    const dp: number[][] = Array(m + 1).fill(0).map(() => Array(n + 1).fill(0));
    
    // Initialize first row and column
    for (let i = 0; i <= m; i++) dp[i][0] = i;
    for (let j = 0; j <= n; j++) dp[0][j] = j;
    
    // Fill the matrix
    for (let i = 1; i <= m; i++) {
      for (let j = 1; j <= n; j++) {
        const cost = str1[i - 1] === str2[j - 1] ? 0 : 1;
        dp[i][j] = Math.min(
          dp[i - 1][j] + 1,
          dp[i][j - 1] + 1,
          dp[i - 1][j - 1] + cost
        );
      }
    }
    
    return dp[m][n];
  };
  
  // Download processed text
  const downloadProcessedText = () => {
    if (!processedText) return;
    
    const element = document.createElement('a');
    const file = new Blob([processedText], {type: 'text/plain'});
    element.href = URL.createObjectURL(file);
    element.download = `deduplicated_${fileName || 'text.txt'}`;
    document.body.appendChild(element);
    element.click();
    document.body.removeChild(element);
  };
  
  // Reset the form
  const resetForm = () => {
    setOriginalText('');
    setProcessedText('');
    setFileName('');
    setStats({ original: 0, processed: 0, removed: 0, duplicatesFound: 0 });
    if (fileInputRef.current) fileInputRef.current.value = '';
  };
  
  // Copy to clipboard
  const copyToClipboard = () => {
    navigator.clipboard.writeText(processedText).then(() => {
      // Show toast or notification (implementation omitted for brevity)
      alert('Copied to clipboard!');
    });
  };
  
  // Generate dynamic styles based on theme
  const getGradientStyle = () => {
    return {
      background: `linear-gradient(45deg, ${currentColors.gradient1}, ${currentColors.gradient2}, ${currentColors.primary})`,
      backgroundSize: '200% 200%',
      animation: 'gradient 15s ease infinite'
    };
  };
  
  // Drag and drop handlers
  const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
  };
  
  const handleDrop = async (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      if (batchMode && e.dataTransfer.files.length > 1) {
        setBatchFiles(Array.from(e.dataTransfer.files));
      } else {
        const file = e.dataTransfer.files[0];
        setFileName(file.name);
        
        try {
          const text = await readFileAsText(file);
          setOriginalText(text);
          setProcessedText('');
          setStats({
            original: text.length,
            processed: 0,
            removed: 0,
            duplicatesFound: 0
          });
          
          // Quick preview of potential duplicates
          if (text.length > 0) {
            generateDuplicatePreview(text);
          }
        } catch (error) {
          console.error('Error reading file:', error);
        }
      }
    }
  };
  
  return (
    <div 
      className="p-6 max-w-5xl mx-auto rounded-lg shadow-lg"
      style={{ 
        backgroundColor: currentColors.background,
        color: currentColors.text,
        transition: 'all 0.3s ease'
      }}
    >
      {/* Header with gradient */}
      <div 
        className="rounded-lg p-6 mb-6 text-white"
        style={getGradientStyle()}
      >
        <div className="flex justify-between items-center">
          <h1 className="text-2xl font-bold">Text Block Deduplicator</h1>
          <button 
            onClick={toggleTheme}
            className="p-2 rounded-full bg-white bg-opacity-20 hover:bg-opacity-30"
            aria-label={theme === 'light' ? 'Switch to dark mode' : 'Switch to light mode'}
          >
            {theme === 'light' ? <Moon size={18} /> : <Sun size={18} />}
          </button>
        </div>
        <p className="mt-2 text-white text-opacity-90">
          Intelligently remove duplicate content blocks from web-scraped text.
        </p>
      </div>
      
      {/* Main Content */}
      <div className="flex flex-col lg:flex-row gap-6">
        {/* Left Column - Controls */}
        <div className="w-full lg:w-2/5">
          {/* Mode Switcher */}
          <div className="mb-6 flex rounded-lg overflow-hidden" style={{ border: `1px solid ${currentColors.border}` }}>
            <button
              onClick={() => setBatchMode(false)}
              className="flex-1 py-2 px-4 text-center font-medium text-sm"
              style={{ 
                backgroundColor: !batchMode ? currentColors.primary : 'transparent',
                color: !batchMode ? 'white' : currentColors.text
              }}
            >
              Single File Mode
            </button>
            <button
              onClick={() => setBatchMode(true)}
              className="flex-1 py-2 px-4 text-center font-medium text-sm"
              style={{ 
                backgroundColor: batchMode ? currentColors.primary : 'transparent',
                color: batchMode ? 'white' : currentColors.text
              }}
            >
              Batch Processing
            </button>
          </div>
          
          {/* File Upload */}
          <div 
            className="mb-6 p-8 rounded-lg text-center cursor-pointer"
            style={{ 
              backgroundColor: currentColors.backgroundSecondary,
              border: `2px dashed ${currentColors.border}`
            }}
            onDragOver={handleDragOver}
            onDrop={handleDrop}
            onClick={() => batchMode ? batchInputRef.current?.click() : fileInputRef.current?.click()}
          >
            <div className="text-4xl mb-2 flex justify-center" style={{ color: currentColors.primary }}>
              <Upload size={48} />
            </div>
            <p className="mb-2 font-medium">
              {batchMode ? 'Drop multiple files here or click to browse' : 'Drop file here or click to browse'}
            </p>
            <p className="text-sm" style={{ color: currentColors.textSecondary }}>
              Supports .txt files
            </p>
            {batchMode ? (
              <input
                type="file"
                multiple
                accept=".txt"
                onChange={handleBatchFileUpload}
                className="hidden"
                ref={batchInputRef}
              />
            ) : (
              <input
                type="file"
                accept=".txt"
                onChange={handleFileUpload}
                className="hidden"
                ref={fileInputRef}
              />
            )}
            
            {/* File info */}
            {!batchMode && fileName && (
              <div 
                className="mt-4 p-2 rounded-md text-left"
                style={{ backgroundColor: currentColors.background }}
              >
                <p className="text-sm font-medium">Selected: {fileName}</p>
                <p className="text-xs" style={{ color: currentColors.textSecondary }}>
                  Size: {Math.round(originalText.length / 1024)} KB
                </p>
              </div>
            )}
            
            {/* Batch files info */}
            {batchMode && batchFiles.length > 0 && (
              <div 
                className="mt-4 p-2 rounded-md text-left"
                style={{ backgroundColor: currentColors.background }}
              >
                <p className="text-sm font-medium">{batchFiles.length} files selected</p>
                {batchFiles.length <= 5 && (
                  <ul className="text-xs mt-1" style={{ color: currentColors.textSecondary }}>
                    {batchFiles.map((file, index) => (
                      <li key={index}>{file.name} ({Math.round(file.size / 1024)} KB)</li>
                    ))}
                  </ul>
                )}
              </div>
            )}
          </div>
          
          {/* Sensitivity Settings */}
          <div 
            className="mb-6 p-4 rounded-lg"
            style={{ backgroundColor: currentColors.backgroundSecondary }}
          >
            <h3 className="text-sm font-medium mb-4">Deduplication Settings</h3>
            
            <div className="mb-4">
              <label className="block text-sm font-medium mb-2">
                Similarity Threshold: {Math.round(similarity * 100)}%
              </label>
              <input
                type="range"
                min="0.3"
                max="0.95"
                step="0.05"
                value={similarity}
                onChange={(e) => setSimilarity(parseFloat(e.target.value))}
                className="w-full h-2 rounded-full appearance-none cursor-pointer"
                style={{ 
                  backgroundColor: currentColors.border,
                  accentColor: currentColors.primary
                }}
              />
              <div className="flex justify-between text-xs mt-1" style={{ color: currentColors.textSecondary }}>
                <span>More Aggressive</span>
                <span>More Conservative</span>
              </div>
            </div>
            
            <div className="mb-4">
              <label className="block text-sm font-medium mb-2">
                Minimum Block Size: {minBlockSize} characters
              </label>
              <input
                type="range"
                min="10"
                max="150"
                step="5"
                value={minBlockSize}
                onChange={(e) => setMinBlockSize(parseInt(e.target.value))}
                className="w-full h-2 rounded-full appearance-none cursor-pointer"
                style={{ 
                  backgroundColor: currentColors.border,
                  accentColor: currentColors.primary
                }}
              />
              <p className="text-xs mt-1" style={{ color: currentColors.textSecondary }}>
                Blocks smaller than this are preserved
              </p>
            </div>
            
            {/* Toggle for Advanced Options */}
            <button
              onClick={() => setShowAdvanced(!showAdvanced)}
              className="w-full text-sm py-2 px-4 rounded-md flex items-center justify-center"
              style={{ 
                backgroundColor: showAdvanced ? currentColors.primary : 'transparent',
                color: showAdvanced ? 'white' : currentColors.primary,
                border: `1px solid ${currentColors.primary}`
              }}
            >
              {showAdvanced ? (
                <>
                  <ChevronUp size={16} className="mr-1" /> Hide Advanced Options
                </>
              ) : (
                <>
                  <ChevronDown size={16} className="mr-1" /> Show Advanced Options
                </>
              )}
            </button>
            
            {/* Advanced Options Section */}
            {showAdvanced && (
              <div className="mt-4 space-y-4">
                <div>
                  <label className="block text-sm font-medium mb-2">
                    Similarity Algorithm
                  </label>
                  <select
                    value={algorithm}
                    onChange={(e) => setAlgorithm(e.target.value)}
                    className="w-full p-2 rounded-md"
                    style={{ 
                      backgroundColor: currentColors.background,
                      color: currentColors.text,
                      border: `1px solid ${currentColors.border}`
                    }}
                  >
                    <option value="jaccard">Jaccard (Best for general use)</option>
                    <option value="cosine">Cosine (Best for longer texts)</option>
                    <option value="levenshtein">Levenshtein (Best for short phrases)</option>
                  </select>
                </div>
                
                <div>
                  <label className="block text-sm font-medium mb-2">
                    Text Block Detection
                  </label>
                  <select
                    value={blockSplitMethod}
                    onChange={(e) => setBlockSplitMethod(e.target.value)}
                    className="w-full p-2 rounded-md"
                    style={{ 
                      backgroundColor: currentColors.background,
                      color: currentColors.text,
                      border: `1px solid ${currentColors.border}`
                    }}
                  >
                    <option value="paragraph">Paragraphs (Default)</option>
                    <option value="sentence">Sentences</option>
                    <option value="hybrid">Hybrid (Paragraphs + Sentences)</option>
                    <option value="sized">Fixed Size Chunks</option>
                  </select>
                </div>
                
                <div>
                  <label className="block text-sm font-medium mb-2">
                    Preserve Patterns (Regex, one per line)
                  </label>
                  <textarea
                    value={preservePatterns}
                    onChange={(e) => setPreservePatterns(e.target.value)}
                    placeholder="E.g. ^Chapter [0-9]+"
                    rows={3}
                    className="w-full p-2 rounded-md"
                    style={{ 
                      backgroundColor: currentColors.background,
                      color: currentColors.text,
                      border: `1px solid ${currentColors.border}`
                    }}
                  />
                  <p className="text-xs mt-1" style={{ color: currentColors.textSecondary }}>
                    Text matching these patterns will be preserved
                  </p>
                </div>
              </div>
            )}
          </div>
          
          {/* Process Button */}
          <div className="mb-6">
            {batchMode ? (
              <button
                onClick={processBatchFiles}
                disabled={batchFiles.length === 0 || isProcessing}
                className="w-full py-3 px-4 rounded-md font-medium text-white flex items-center justify-center"
                style={{ 
                  backgroundColor: batchFiles.length === 0 || isProcessing ? currentColors.textSecondary : currentColors.primary,
                  opacity: batchFiles.length === 0 || isProcessing ? 0.7 : 1
                }}
              >
                {isProcessing ? (
                  <>
                    <RefreshCw size={18} className="mr-2 animate-spin" /> Processing Batch...
                  </>
                ) : (
                  <>
                    <FileText size={18} className="mr-2" /> Process {batchFiles.length} Files
                  </>
                )}
              </button>
            ) : (
              <button
                onClick={processText}
                disabled={!originalText || isProcessing}
                className="w-full py-3 px-4 rounded-md font-medium text-white flex items-center justify-center"
                style={{ 
                  backgroundColor: !originalText || isProcessing ? currentColors.textSecondary : currentColors.primary,
                  opacity: !originalText || isProcessing ? 0.7 : 1
                }}
              >
                {isProcessing ? (
                  <>
                    <RefreshCw size={18} className="mr-2 animate-spin" /> Processing...
                  </>
                ) : (
                  <>
                    <FileText size={18} className="mr-2" /> Remove Duplicate Blocks
                  </>
                )}
              </button>
            )}
          </div>
          
          {/* Preview of duplicates */}
          {!batchMode && showPreview && previewDuplicates.length > 0 && (
            <div 
              className="mb-6 p-4 rounded-lg"
              style={{ backgroundColor: currentColors.backgroundSecondary }}
            >
              <div className="flex justify-between items-center mb-2">
                <h3 className="text-sm font-medium">Potential Duplicates Preview</h3>
                <button
                  onClick={() => setShowPreview(false)}
                  className="text-xs"
                  style={{ color: currentColors.primary }}
                >
                  Hide
                </button>
              </div>
              <div className="space-y-2 max-h-60 overflow-y-auto">
                {previewDuplicates.map((example, index) => (
                  <div 
                    key={index} 
                    className="p-2 rounded"
                    style={{ backgroundColor: currentColors.background }}
                  >
                    <div 
                      className="text-xs mb-1 rounded px-2 py-1 inline-block"
                      style={{ 
                        backgroundColor: currentColors.primary,
                        color: 'white'
                      }}
                    >
                      {Math.round(example.similarity * 100)}% Similar
                    </div>
                    <div className="text-xs overflow-hidden text-ellipsis" style={{ color: currentColors.textSecondary }}>
                      Original: {example.original.substring(0, 100)}...
                    </div>
                    <div className="text-xs overflow-hidden text-ellipsis" style={{ color: currentColors.textSecondary }}>
                      Duplicate: {example.duplicate.substring(0, 100)}...
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
          
          {/* Analytics - Processing History */}
          {processingHistory.length > 0 && (
            <div 
              className="mb-6 p-4 rounded-lg"
              style={{ backgroundColor: currentColors.backgroundSecondary }}
            >
              <h3 className="text-sm font-medium mb-2">Processing History</h3>
              <div className="max-h-40 overflow-y-auto">
                {processingHistory.slice().reverse().map((entry, index) => (
                  <div 
                    key={index}
                    className="text-xs p-2 mb-2 rounded"
                    style={{ backgroundColor: currentColors.background }}
                  >
                    <div className="flex justify-between">
                      <span className="font-medium">
                        {entry.fileName || `Batch (${entry.files?.length || 0} files)`}
                      </span>
                      <span style={{ color: currentColors.textSecondary }}>
                        {new Date(entry.timestamp).toLocaleString()}
                      </span>
                    </div>
                    {entry.fileName ? (
                      <div className="mt-1">
                        Reduction: {entry.reduction}% ({Math.round((entry.originalSize - entry.processedSize) / 1024)} KB)
                      </div>
                    ) : (
                      <div className="mt-1">
                        Processed {entry.files.length} files
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
        
        {/* Right Column - Results */}
        <div className="w-full lg:w-3/5">
          {/* Progress Bar */}
          {isProcessing && (
            <div className="mb-6">
              <div className="flex justify-between text-xs mb-1">
                <span>Processing{batchMode ? ` file ${batchProgress.current}/${batchProgress.total}` : ''}</span>
                <span>{progress}%</span>
              </div>
              <div 
                className="w-full rounded-full h-2 overflow-hidden"
                style={{ backgroundColor: currentColors.border }}
              >
                <div
                  className="h-full rounded-full"
                  style={{ 
                    width: `${progress}%`,
                    background: `linear-gradient(90deg, ${currentColors.primary}, ${currentColors.secondary})`
                  }}
                ></div>
              </div>
            </div>
          )}
          
          {/* Results Metrics */}
          {!batchMode && processedText && (
            <div className="mb-6">
              <div 
                className="p-4 rounded-lg"
                style={{ backgroundColor: currentColors.backgroundSecondary }}
              >
                <h3 className="text-sm font-medium mb-3">Results Summary</h3>
                <div className="grid grid-cols-4 gap-4 text-center">
                  <div>
                    <p className="text-lg font-semibold">{Math.round(stats.original / 1000)}K</p>
                    <p className="text-xs" style={{ color: currentColors.textSecondary }}>Original Size</p>
                  </div>
                  <div>
                    <p className="text-lg font-semibold">{Math.round(stats.processed / 1000)}K</p>
                    <p className="text-xs" style={{ color: currentColors.textSecondary }}>Processed Size</p>
                  </div>
                  <div>
                    <p className="text-lg font-semibold">{Math.round((stats.removed / stats.original) * 100)}%</p>
                    <p className="text-xs" style={{ color: currentColors.textSecondary }}>Reduction</p>
                  </div>
                  <div>
                    <p className="text-lg font-semibold">{stats.duplicatesFound}</p>
                    <p className="text-xs" style={{ color: currentColors.textSecondary }}>Duplicates Found</p>
                  </div>
                </div>
              </div>
            </div>
          )}
          
          {/* Processed Text Result */}
          {!batchMode && (
            <div className="mb-6">
              <div className="flex justify-between items-center mb-2">
                <h3 className="text-sm font-medium">Processed Text</h3>
                <div className="flex space-x-2">
                  {processedText && (
                    <>
                      <button
                        onClick={copyToClipboard}
                        className="text-xs py-1 px-2 rounded flex items-center"
                        style={{ 
                          backgroundColor: currentColors.backgroundSecondary,
                          color: currentColors.primary
                        }}
                      >
                        <Copy size={14} className="mr-1" /> Copy
                      </button>
                      <button
                        onClick={downloadProcessedText}
                        className="text-xs py-1 px-2 rounded flex items-center"
                        style={{ 
                          backgroundColor: currentColors.backgroundSecondary,
                          color: currentColors.primary
                        }}
                      >
                        <Download size={14} className="mr-1" /> Download
                      </button>
                    </>
                  )}
                </div>
              </div>
              <div 
                className="border rounded-lg h-96 overflow-auto"
                style={{ 
                  borderColor: currentColors.border,
                  backgroundColor: currentColors.backgroundSecondary
                }}
              >
                {processedText ? (
                  <pre 
                    className="p-4 text-sm whitespace-pre-wrap"
                    style={{ color: currentColors.text }}
                  >
                    {processedText}
                  </pre>
                ) : (
                  <div 
                    className="h-full flex items-center justify-center"
                    style={{ color: currentColors.textSecondary }}
                  >
                    <p className="text-sm">
                      {originalText ? 'Click "Remove Duplicate Blocks" to process' : 'Upload a file to get started'}
                    </p>
                  </div>
                )}
              </div>
            </div>
          )}
          
          {/* Batch Processing Results */}
          {batchMode && batchFiles.length > 0 && (
            <div className="mb-6">
              <h3 className="text-sm font-medium mb-2">Batch Processing Queue</h3>
              <div 
                className="border rounded-lg overflow-hidden"
                style={{ 
                  borderColor: currentColors.border,
                  backgroundColor: currentColors.backgroundSecondary
                }}
              >
                <table className="w-full text-sm">
                  <thead>
                    <tr style={{ backgroundColor: currentColors.background }}>
                      <th className="p-2 text-left">File Name</th>
                      <th className="p-2 text-right">Size</th>
                      <th className="p-2 text-right">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {batchFiles.map((file, index) => (
                      <tr 
                        key={index}
                        style={{ 
                          borderTop: `1px solid ${currentColors.border}`,
                          backgroundColor: index % 2 === 0 ? currentColors.backgroundSecondary : currentColors.background
                        }}
                      >
                        <td className="p-2 truncate" style={{ maxWidth: "200px" }}>{file.name}</td>
                        <td className="p-2 text-right">{Math.round(file.size / 1024)} KB</td>
                        <td className="p-2 text-right">
                          {isProcessing && batchProgress.current > index ? (
                            <span style={{ color: currentColors.accent }}>Completed</span>
                          ) : isProcessing && batchProgress.current === index + 1 ? (
                            <span style={{ color: currentColors.primary }}>Processing...</span>
                          ) : (
                            <span style={{ color: currentColors.textSecondary }}>Queued</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
          
          {/* Help & Tips */}
          <div 
            className="rounded-lg p-4"
            style={{ 
              backgroundColor: currentColors.backgroundSecondary,
              borderLeft: `4px solid ${currentColors.accent}`
            }}
          >
            <h3 className="text-sm font-medium mb-2">Tips for Better Results</h3>
            <ul 
              className="text-xs space-y-1 list-disc pl-4"
              style={{ color: currentColors.textSecondary }}
            >
              <li>Adjust similarity threshold based on content type (lower for technical, higher for prose)</li>
              <li>Use "Preserve Patterns" to keep important content (like chapter headings)</li>
              <li>For navigation menus and footers, a threshold of 60-70% works best</li>
              <li>Try different algorithms for different content types</li>
              <li>Use batch mode for processing multiple pages from the same site</li>
            </ul>
          </div>
        </div>
      </div>
      
      {/* Footer */}
      <div 
        className="mt-8 text-center text-xs pt-4"
        style={{ 
          borderTop: `1px solid ${currentColors.border}`,
          color: currentColors.textSecondary
        }}
      >
        <p>Text Block Deduplicator • v2.0 • {new Date().getFullYear()}</p>
        <p className="mt-1">Optimized for web content preparation for LLM processing.</p><p> Sponsored by <a href="https://hypenerds.agency">Hype Nerds</a></p>
        <style>{`
          @keyframes gradient {
            0% { background-position: 0% 50%; }
            50% { background-position: 100% 50%; }
            100% { background-position: 0% 50%; }
          }
        `}</style>
      </div>
    </div>
  );
}

export default App;