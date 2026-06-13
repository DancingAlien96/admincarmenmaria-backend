// Normaliza un nombre para comparar/detectar duplicados:
// minúsculas, sin acentos, sin signos, espacios colapsados.
export function normalizeName(name: string | null | undefined): string {
  return (name ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "") // quita acentos (marcas combinantes)
    .replace(/[^a-z0-9 ]/g, " ") // signos -> espacio
    .trim()
    .replace(/\s+/g, " ");
}
