"use client";

import { useState } from "react";

type Prediction = { className: string; probability: number };
type Result = {
  safe: boolean;
  scores: { porn: number; hentai: number; sexy: number };
  predictions: Prediction[];
  error?: string;
};

function ScoreBar({ value }: { value: number }) {
  const color =
    value > 0.5 ? "bg-red-500" : value > 0.2 ? "bg-yellow-500" : "bg-green-500";
  return (
    <div className="h-0.5 w-full bg-gray-200 rounded-full mt-2 overflow-hidden">
      <div className={`h-full ${color} rounded-full`} style={{ width: `${value * 100}%` }} />
    </div>
  );
}

export default function Home() {
  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<Result | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showRaw, setShowRaw] = useState(false);

  const handleFile = (f: File) => {
    setFile(f);
    setPreviewUrl(null);
    setResult(null);
    setError(null);
  };

  const handleCheck = async () => {
    if (!file) return;
    setLoading(true);
    setResult(null);
    setError(null);

    try {
      const formData = new FormData();
      formData.append("image", file);
      const res = await fetch("/api/moderate", { method: "POST", body: formData });
      const data: Result = await res.json();
      if (data.error) throw new Error(data.error);
      setResult(data);
      if (data.safe) setPreviewUrl(URL.createObjectURL(file));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Moderation request failed");
    } finally {
      setLoading(false);
    }
  };

  const scores = result
    ? [
        { label: "Porn", value: result.scores.porn },
        { label: "Hentai", value: result.scores.hentai },
        { label: "Sexy", value: result.scores.sexy },
      ]
    : [];

  return (
    <main className="max-w-xl mx-auto px-4 py-10 font-sans">
      <div className="mb-8">
        <h1 className="text-xl font-medium text-white">Image moderation</h1>
        <p className="text-sm text-gray-500 mt-1">
          Check whether an image is safe before publishing.
        </p>
      </div>

      {/* Drop zone */}
      <label className="relative flex flex-col items-center justify-center gap-2 border border-dashed border-gray-300 rounded-xl bg-gray-50 p-10 cursor-pointer hover:border-gray-400 hover:bg-white transition">
        <input
          type="file"
          accept="image/*"
          className="absolute inset-0 opacity-0 cursor-pointer"
          onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); }}
        />
        <svg className="w-8 h-8 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 16.5V19a2 2 0 002 2h14a2 2 0 002-2v-2.5M16 10l-4-4m0 0L8 10m4-4v12" />
        </svg>
        <span className="text-sm text-gray-500">Drop an image or click to browse</span>
        <span className="text-xs text-gray-400">JPG, PNG, WEBP</span>
      </label>

      {file && (
        <div className="mt-3 inline-flex items-center gap-2 text-sm text-gray-600 bg-white border border-gray-200 rounded-lg px-3 py-1.5">
          <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14" />
          </svg>
          {file.name}
        </div>
      )}

      {previewUrl && (
        <img src={previewUrl} alt="Approved preview" className="mt-4 w-full max-h-64 object-contain rounded-lg border border-gray-200" />
      )}

      <button
        onClick={handleCheck}
        disabled={!file || loading}
        className="mt-4 w-full flex items-center justify-center gap-2 py-2.5 px-4 rounded-lg bg-gray-900 text-white text-sm font-medium hover:bg-gray-700 disabled:opacity-40 disabled:cursor-not-allowed transition"
      >
        {loading ? (
          <>
            <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
            </svg>
            Analyzing...
          </>
        ) : (
          "Check image"
        )}
      </button>

      {error && (
        <div className="mt-4 flex items-center gap-2 text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg px-4 py-3">
          <svg className="w-4 h-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01M12 3a9 9 0 100 18A9 9 0 0012 3z" />
          </svg>
          {error}
        </div>
      )}

      {result && (
        <div className="mt-6 border border-gray-200 rounded-xl overflow-hidden">
          <div className="flex items-center gap-3 px-5 py-4 border-b border-gray-100">
            <span className={`inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-md ${result.safe ? "bg-green-50 text-green-700" : "bg-red-50 text-red-700"}`}>
              {result.safe ? "✓ Safe" : "✕ NSFW detected"}
            </span>
            <span className="text-sm text-gray-400">{file?.name}</span>
          </div>

          <div className="px-5 py-4">
            <div className="grid grid-cols-3 gap-3 mb-4">
              {scores.map(({ label, value }) => (
                <div key={label} className="bg-gray-50 rounded-lg p-3 text-center">
                  <p className="text-xs text-gray-400 uppercase tracking-wide mb-1">{label}</p>
                  <p className="text-lg font-medium text-gray-900">{(value * 100).toFixed(1)}%</p>
                  <ScoreBar value={value} />
                </div>
              ))}
            </div>

            <button
              onClick={() => setShowRaw(!showRaw)}
              className="flex items-center gap-1.5 text-sm text-gray-400 hover:text-gray-600 pt-3 border-t border-gray-100 w-full transition"
            >
              <svg className={`w-4 h-4 transition-transform ${showRaw ? "rotate-180" : ""}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
              Raw predictions
            </button>

            {showRaw && (
              <pre className="mt-3 p-3 bg-gray-50 rounded-lg text-xs text-gray-500 overflow-x-auto">
                {JSON.stringify(result.predictions, null, 2)}
              </pre>
            )}
          </div>
        </div>
      )}
    </main>
  );
}