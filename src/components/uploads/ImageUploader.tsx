import { useState, useRef, useCallback } from "react";
import { ImagePlus, X, GripVertical, Star, AlertCircle, Loader2 } from "lucide-react";
import { Label } from "@/components/ui/label";

interface ImageUploaderProps {
  images: string[];
  onChange: (images: string[]) => void;
  disabled?: boolean;
  maxImages?: number;
  maxSizeMB?: number;
}

export function ImageUploader({
  images,
  onChange,
  disabled = false,
  maxImages = 10,
  maxSizeMB = 5,
}: ImageUploaderProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [dragOverZone, setDragOverZone] = useState(false);
  const [draggingIndex, setDraggingIndex] = useState<number | null>(null);
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);
  const [isCompressing, setIsCompressing] = useState(false);
  const [errors, setErrors] = useState<string[]>([]);

  const compressImage = useCallback(
    (file: File, maxWidth = 1200, quality = 0.82): Promise<string> => {
      return new Promise((resolve, reject) => {
        if (file.size < 200 * 1024) {
          const reader = new FileReader();
          reader.onload = (e) => resolve(e.target?.result as string);
          reader.onerror = reject;
          reader.readAsDataURL(file);
          return;
        }
        const img = new Image();
        img.onload = () => {
          const canvas = document.createElement("canvas");
          const ratio = Math.min(maxWidth / img.width, 1);
          canvas.width = Math.round(img.width * ratio);
          canvas.height = Math.round(img.height * ratio);
          const ctx = canvas.getContext("2d")!;
          ctx.imageSmoothingEnabled = true;
          ctx.imageSmoothingQuality = "high";
          ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
          const result = canvas.toDataURL("image/jpeg", quality);
          URL.revokeObjectURL(img.src);
          resolve(result);
        };
        img.onerror = () => { URL.revokeObjectURL(img.src); reject(new Error("Failed to load image")); };
        img.src = URL.createObjectURL(file);
      });
    },
    []
  );

  const processFiles = useCallback(
    async (fileList: FileList | File[]) => {
      const files = Array.from(fileList);
      const newErrors: string[] = [];
      const remaining = maxImages - images.length;
      if (remaining <= 0) { setErrors([`Maximum ${maxImages} images allowed`]); return; }
      const validFiles = files.slice(0, remaining);
      if (files.length > remaining) newErrors.push(`Only ${remaining} more image${remaining === 1 ? "" : "s"} can be added`);
      const accepted: File[] = [];
      for (const file of validFiles) {
        if (!file.type.startsWith("image/")) { newErrors.push(`${file.name}: Not an image file`); continue; }
        if (file.size > maxSizeMB * 1024 * 1024) { newErrors.push(`${file.name}: Exceeds ${maxSizeMB}MB limit`); continue; }
        accepted.push(file);
      }
      setErrors(newErrors);
      if (accepted.length === 0) return;
      setIsCompressing(true);
      try {
        const compressed = await Promise.all(accepted.map((f) => compressImage(f)));
        onChange([...images, ...compressed]);
      } catch { setErrors((prev) => [...prev, "Failed to process some images"]); }
      finally { setIsCompressing(false); }
    },
    [images, onChange, maxImages, maxSizeMB, compressImage]
  );

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) processFiles(e.target.files);
    e.target.value = "";
  };

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDragOverZone(false);
      if (disabled) return;
      if (e.dataTransfer.files.length > 0 && draggingIndex === null) processFiles(e.dataTransfer.files);
    },
    [disabled, draggingIndex, processFiles]
  );

  const handleDragStart = (index: number) => { if (disabled) return; setDraggingIndex(index); };
  const handleDragOver = (e: React.DragEvent, index: number) => {
    e.preventDefault();
    if (draggingIndex === null || draggingIndex === index) return;
    setDragOverIndex(index);
  };
  const handleDragEnd = () => {
    if (draggingIndex !== null && dragOverIndex !== null && draggingIndex !== dragOverIndex) {
      const reordered = [...images];
      const [moved] = reordered.splice(draggingIndex, 1);
      reordered.splice(dragOverIndex, 0, moved);
      onChange(reordered);
    }
    setDraggingIndex(null);
    setDragOverIndex(null);
  };

  const removeImage = (index: number) => { onChange(images.filter((_, i) => i !== index)); setErrors([]); };
  const makeCover = (index: number) => {
    if (index === 0) return;
    const reordered = [...images];
    const [moved] = reordered.splice(index, 1);
    reordered.unshift(moved);
    onChange(reordered);
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <Label className="text-sm font-medium">
          Photos
          <span className="text-muted-foreground font-normal ml-1.5">({images.length}/{maxImages})</span>
        </Label>
        {images.length > 1 && (
          <span className="text-xs text-muted-foreground">Drag to reorder · First image is the cover</span>
        )}
      </div>

      <input
        ref={fileInputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        multiple
        className="hidden"
        onChange={handleFileChange}
        disabled={disabled}
      />

      <div
        className={`relative rounded-xl border-2 border-dashed transition-colors p-3 ${
          dragOverZone && draggingIndex === null ? "border-primary bg-primary/5" : "border-border"
        }`}
        onDragOver={(e) => { e.preventDefault(); if (draggingIndex === null) setDragOverZone(true); }}
        onDragLeave={() => setDragOverZone(false)}
        onDrop={handleDrop}
      >
        {images.length === 0 ? (
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={disabled || isCompressing}
            className="w-full py-12 flex flex-col items-center justify-center gap-3 text-muted-foreground hover:text-primary transition-colors disabled:opacity-50"
          >
            {isCompressing ? (
              <><Loader2 className="h-10 w-10 animate-spin text-primary" /><span className="text-sm font-medium">Compressing images…</span></>
            ) : (
              <>
                <div className="h-14 w-14 rounded-2xl bg-primary/10 flex items-center justify-center">
                  <ImagePlus className="h-7 w-7 text-primary" />
                </div>
                <div className="text-center">
                  <p className="text-sm font-medium">Drop images here or click to browse</p>
                  <p className="text-xs text-muted-foreground mt-1">JPEG, PNG, WebP · Max {maxSizeMB}MB each · Up to {maxImages} images</p>
                </div>
              </>
            )}
          </button>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
            {images.map((src, i) => (
              <div
                key={`${i}-${src.slice(-20)}`}
                draggable={!disabled}
                onDragStart={() => handleDragStart(i)}
                onDragOver={(e) => handleDragOver(e, i)}
                onDragEnd={handleDragEnd}
                className={`relative aspect-[4/3] rounded-lg overflow-hidden group cursor-grab active:cursor-grabbing transition-all ${
                  draggingIndex === i ? "opacity-30 scale-95"
                  : dragOverIndex === i ? "ring-2 ring-primary ring-offset-2 ring-offset-background scale-[1.02]"
                  : ""
                }`}
              >
                <img src={src} alt={`Upload ${i + 1}`} className="w-full h-full object-cover" draggable={false} />
                <div className="absolute inset-0 bg-black/0 group-hover:bg-black/40 transition-colors" />
                {i === 0 && (
                  <div className="absolute top-1.5 left-1.5 flex items-center gap-1 bg-primary text-primary-foreground text-[10px] font-semibold px-2 py-0.5 rounded-full shadow-sm">
                    <Star className="h-2.5 w-2.5 fill-current" /> COVER
                  </div>
                )}
                <div className="absolute top-1.5 right-1.5 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                  {i !== 0 && (
                    <button type="button" onClick={() => makeCover(i)} disabled={disabled}
                      className="h-6 w-6 rounded-full bg-white/90 hover:bg-white text-foreground flex items-center justify-center shadow-sm transition-colors" title="Make cover">
                      <Star className="h-3 w-3" />
                    </button>
                  )}
                  <button type="button" onClick={() => removeImage(i)} disabled={disabled}
                    className="h-6 w-6 rounded-full bg-white/90 hover:bg-destructive hover:text-white text-foreground flex items-center justify-center shadow-sm transition-colors" title="Remove">
                    <X className="h-3 w-3" />
                  </button>
                </div>
                <div className="absolute bottom-1.5 left-1.5 opacity-0 group-hover:opacity-100 transition-opacity">
                  <div className="h-6 w-6 rounded-full bg-white/80 flex items-center justify-center shadow-sm">
                    <GripVertical className="h-3 w-3 text-foreground/60" />
                  </div>
                </div>
              </div>
            ))}
            {images.length < maxImages && (
              <button type="button" onClick={() => fileInputRef.current?.click()} disabled={disabled || isCompressing}
                className="aspect-[4/3] rounded-lg border-2 border-dashed border-border flex flex-col items-center justify-center gap-1.5 text-muted-foreground hover:border-primary hover:text-primary transition-colors disabled:opacity-50">
                {isCompressing ? <Loader2 className="h-5 w-5 animate-spin" /> : <><ImagePlus className="h-5 w-5" /><span className="text-[11px] font-medium">Add more</span></>}
              </button>
            )}
          </div>
        )}
      </div>

      {errors.length > 0 && (
        <div className="space-y-1">
          {errors.map((err, i) => (
            <div key={i} className="flex items-start gap-2 text-destructive text-xs">
              <AlertCircle className="h-3.5 w-3.5 mt-0.5 flex-shrink-0" />
              <span>{err}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
