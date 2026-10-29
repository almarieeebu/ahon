/** Small line icons for navigation. Decorative: labels always sit beside them. */

const paths = {
  home: "M3.5 9.2 10 4l6.5 5.2V16a.5.5 0 0 1-.5.5h-3.5v-4.5h-5v4.5H4a.5.5 0 0 1-.5-.5z",
  activity: "M4 5h12M4 10h12M4 15h7",
  budget: "M10 3.5a6.5 6.5 0 1 0 6.5 6.5H10zM12 2.8V8h5.2A5.5 5.5 0 0 0 12 2.8z",
  loans: "M3.5 6.5h13v8a1 1 0 0 1-1 1h-11a1 1 0 0 1-1-1zM3.5 9.5h13M6.5 12.5h3",
  savings: "M4 9.5c0-2.8 2.7-4.5 6-4.5s6 1.7 6 4.5c0 1.6-.8 2.8-2 3.6V16h-2.5v-1.6a9 9 0 0 1-3 0V16H6v-2.9C4.8 12.3 4 11.1 4 9.5zM13 8.5h.01",
  income: "M10 16V4M5.5 8.5 10 4l4.5 4.5",
  names: "M4 4.5h7l5 5-6.5 6.5-5.5-5.5zM7.5 8h.01",
  wallets: "M3.5 6.5a1.5 1.5 0 0 1 1.5-1.5h9.5v3M3.5 6.5v8A1.5 1.5 0 0 0 5 16h11.5v-8H5a1.5 1.5 0 0 1-1.5-1.5zM13.5 12h.01",
  profile: "M10 10a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM4 16.5c.8-2.7 3.1-4 6-4s5.2 1.3 6 4",
  more: "M3.5 5.5h13M3.5 10h13M3.5 14.5h13",
  plus: "M10 4v12M4 10h12",
  help: "M7.8 7.6a2.3 2.3 0 1 1 3.2 2.1c-.6.3-1 .8-1 1.5v.3M10 14.5h.01M10 17a7 7 0 1 0 0-14 7 7 0 0 0 0 14z",
  expense: "M10 4v12M14.5 11.5 10 16l-4.5-4.5",
  pay: "M3.5 10.5 8 15l8.5-9",
} as const;

export type IconName = keyof typeof paths;

export function NavIcon({ name, size = 20 }: { name: IconName; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 20 20" fill="none" aria-hidden focusable="false">
      <path
        d={paths[name]}
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
