// lib/format.ts

export const format = {
    currency: (n: number, code = "RM") =>
        `${code}${Number(n).toFixed(2)}`,
    date: (iso: string, fmt = "DD/MM/YYYY") =>
        new Date(iso).toLocaleDateString("en-GB"), // simple; replace with dayjs if needed
    number: (n: number) => new Intl.NumberFormat().format(Number(n)),
};
