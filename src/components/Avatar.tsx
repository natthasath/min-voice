import { initials, textOn } from '../../shared/types';

interface Props {
  name: string;
  color: string;
  size: number;
  radius?: number | string;
  fontSize?: number;
}

export function Avatar({ name, color, size, radius = size * 0.3, fontSize = Math.round(size * 0.36) }: Props) {
  return (
    <span
      className="avatar"
      aria-hidden="true"
      style={{ width: size, height: size, borderRadius: radius, background: color, color: textOn(color), fontSize }}
    >
      {initials(name)}
    </span>
  );
}
