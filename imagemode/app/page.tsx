"use client";

import { useState } from "react";

export default function Home() {
  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<any>(null);

  const handleCheck = async () => {
    if (!file) {
      alert("Please select an image");
      return;
    }

    setLoading(true);
    setResult(null);
    setPreviewUrl(null);

    try {
      const formData = new FormData();
      formData.append("image", file);

      const res = await fetch("/api/moderate", {
        method: "POST",
        body: formData,
      });

      const data = await res.json();

      setResult(data);

      if (!data.safe) {
        alert("NSFW image detected");
        return;
      }

      // Only show image AFTER moderation passes
      setPreviewUrl(URL.createObjectURL(file));

      alert("Image is safe");
    } catch (err) {
      console.error(err);
      alert("Moderation request failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <main
      style={{
        maxWidth: 800,
        margin: "40px auto",
        padding: 24,
        fontFamily: "sans-serif",
      }}
    >
      <h1>NSFW Moderation Test</h1>

      <input
        type="file"
        accept="image/*"
        onChange={(e) => {
          const selected = e.target.files?.[0];

          if (selected) {
            setFile(selected);
            setPreviewUrl(null);
            setResult(null);
          }
        }}
      />

      {file && (
        <div style={{ marginTop: 20 }}>
          <p>
            <strong>File:</strong> {file.name}
          </p>
        </div>
      )}

      <button
        onClick={handleCheck}
        disabled={!file || loading}
        style={{
          marginTop: 20,
          padding: "10px 20px",
          cursor: loading ? "not-allowed" : "pointer",
        }}
      >
        {loading ? "Checking..." : "Check Image"}
      </button>

      {previewUrl && (
        <div style={{ marginTop: 20 }}>
          <img
            src={previewUrl}
            alt="Approved Preview"
            style={{
              maxWidth: 300,
              maxHeight: 300,
              border: "1px solid #ccc",
            }}
          />
        </div>
      )}

      {result && (
        <div
          style={{
            marginTop: 30,
            padding: 16,
            border: "1px solid #ddd",
            borderRadius: 8,
          }}
        >
          <h2>
            Result: {result.safe ? "✅ Safe" : "❌ NSFW"}
          </h2>

          {result.scores && (
            <>
              <p>
                <strong>Porn:</strong>{" "}
                {(result.scores.porn * 100).toFixed(2)}%
              </p>

              <p>
                <strong>Hentai:</strong>{" "}
                {(result.scores.hentai * 100).toFixed(2)}%
              </p>

              <p>
                <strong>Sexy:</strong>{" "}
                {(result.scores.sexy * 100).toFixed(2)}%
              </p>
            </>
          )}

          <details style={{ marginTop: 16 }}>
            <summary>Raw Predictions</summary>

            <pre
              style={{
                marginTop: 12,
                overflowX: "auto",
                background: "#f5f5f5",
                padding: 12,
              }}
            >
              {JSON.stringify(result.predictions, null, 2)}
            </pre>
          </details>
        </div>
      )}
    </main>
  );
}