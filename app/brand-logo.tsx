'use client';

import Image from 'next/image';
import { useState } from 'react';

export default function BrandLogo({ name, src, width, height, className, fallbackClassName }: {
  name: string; src: string; width: number; height: number; className: string; fallbackClassName: string;
}) {
  const [failed, setFailed] = useState(false);
  return failed ? <span className={fallbackClassName}>{name}</span> :
    <Image unoptimized src={src} alt={`${name} 로고`} width={width} height={height}
      loading="lazy" className={className} onError={() => setFailed(true)} />;
}
