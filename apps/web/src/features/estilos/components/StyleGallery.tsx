import type { Tono } from "@syc/contracts";
import type { ReactNode } from "react";
import { useId, useState } from "react";
import { EmptyState } from "@/components/common/EmptyState";
import { ErrorState } from "@/components/common/ErrorState";
import { LoadingState } from "@/components/common/LoadingState";
import { Page } from "@/components/common/Page";
import { PageHeader } from "@/components/common/PageHeader";
import { Badge, badgeTonos, tonoLabels } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { TonoSelect } from "@/features/catalogs/components/TonoSelect";

// Clases escritas completas: Tailwind solo genera las que ve en el código.
const SWATCHES = [
  { token: "background", className: "bg-background" },
  { token: "foreground", className: "bg-foreground" },
  { token: "card", className: "bg-card" },
  { token: "popover", className: "bg-popover" },
  { token: "primary", className: "bg-primary" },
  { token: "primary-active", className: "bg-primary-active" },
  { token: "secondary", className: "bg-secondary" },
  { token: "muted", className: "bg-muted" },
  { token: "muted-foreground", className: "bg-muted-foreground" },
  { token: "accent", className: "bg-accent" },
  { token: "destructive", className: "bg-destructive" },
  { token: "success", className: "bg-success" },
  { token: "warning", className: "bg-warning" },
  { token: "info", className: "bg-info" },
  { token: "border", className: "bg-border" },
  { token: "input", className: "bg-input" },
  { token: "ring", className: "bg-ring" },
] as const;

const BUTTON_VARIANTS = [
  "default",
  "outline",
  "secondary",
  "ghost",
  "destructive",
  "link",
] as const;

function Section({ title, children }: { title: string; children: ReactNode }) {
  const id = useId();
  return (
    <section aria-labelledby={id} className="flex flex-col gap-4">
      <h2 id={id} className="text-lg font-medium">
        {title}
      </h2>
      {children}
    </section>
  );
}

// Referencia para quien programa un módulo nuevo (SPEC 09): todo lo que hay que reutilizar, en un
// solo lugar. Solo existe en desarrollo; la ruta responde «no encontrado» en producción.
export function StyleGallery() {
  const [tono, setTono] = useState<Tono>("gris");
  return (
    <Page>
      <PageHeader
        title="Galería de estilos"
        description="Los tokens y los componentes compartidos de la base visual. Un módulo nuevo parte de acá."
        actions={<Button>Acción principal</Button>}
      />

      <Section title="Paleta">
        <ul className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-6">
          {SWATCHES.map(({ token, className }) => (
            <li key={token} className="flex flex-col gap-1">
              <span className={`h-10 w-full rounded-md border ${className}`} aria-hidden="true" />
              <code className="font-mono text-xs text-muted-foreground">{token}</code>
            </li>
          ))}
        </ul>
      </Section>

      <Section title="Tipografía">
        <div className="flex flex-col gap-3">
          <p className="font-display text-[28px] leading-[1.2] font-medium tracking-[-0.02em]">
            Título de pantalla en serif
          </p>
          <p className="text-base">Texto de interfaz en Inter, 16 px, para cuerpo y formularios.</p>
          <p className="text-sm">Texto denso en 14 px, para tablas, menús y etiquetas.</p>
          <p className="text-sm text-muted-foreground">Texto secundario para descripciones.</p>
          <p className="font-mono text-sm">TE-000013 · números y códigos en JetBrains Mono</p>
        </div>
      </Section>

      <Section title="Botones">
        <div className="flex flex-wrap items-center gap-3">
          {BUTTON_VARIANTS.map((variant) => (
            <Button key={variant} variant={variant}>
              {variant}
            </Button>
          ))}
          <Button disabled>disabled</Button>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <Button size="xs">xs</Button>
          <Button size="sm">sm</Button>
          <Button>default</Button>
          <Button size="lg">lg</Button>
        </div>
      </Section>

      <Section title="Campos">
        <div className="grid max-w-xl gap-4">
          <div className="flex flex-col gap-2">
            <Label htmlFor="galeria-input">Título</Label>
            <Input id="galeria-input" placeholder="Describí el requerimiento" />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="galeria-select">Prioridad</Label>
            <Select defaultValue="media">
              <SelectTrigger id="galeria-select" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="baja">Baja</SelectItem>
                <SelectItem value="media">Media</SelectItem>
                <SelectItem value="alta">Alta</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="galeria-textarea">Descripción</Label>
            <Textarea id="galeria-textarea" placeholder="Detalles, contexto…" />
          </div>
          <div className="flex items-center gap-2">
            <Checkbox id="galeria-check" />
            <Label htmlFor="galeria-check">Se notificó al usuario</Label>
          </div>
        </div>
      </Section>

      <Section title="Tonos de insignia">
        <ul className="flex flex-wrap gap-2">
          {badgeTonos.map((tono) => (
            <li key={tono}>
              <Badge tono={tono}>{tonoLabels[tono]}</Badge>
            </li>
          ))}
        </ul>
        <div className="flex max-w-xs flex-col gap-2">
          <Label htmlFor="galeria-tono">Color</Label>
          <TonoSelect id="galeria-tono" value={tono} onChange={setTono} />
        </div>
      </Section>

      <Section title="Tabla">
        <div className="rounded-xl border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Número</TableHead>
                <TableHead>Título</TableHead>
                <TableHead>Estado</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              <TableRow>
                <TableCell className="font-mono">TE-000013</TableCell>
                <TableCell>Sin conexión en el despacho</TableCell>
                <TableCell>
                  <Badge tono="amarillo">En espera</Badge>
                </TableCell>
              </TableRow>
              <TableRow>
                <TableCell className="font-mono">TE-000012</TableCell>
                <TableCell>Cambiar el tóner de la fotocopiadora</TableCell>
                <TableCell>
                  <Badge tono="verde">Finalizado</Badge>
                </TableCell>
              </TableRow>
            </TableBody>
          </Table>
        </div>
      </Section>

      <Section title="Pestañas">
        <Tabs defaultValue="detalle">
          <TabsList>
            <TabsTrigger value="detalle">Detalle</TabsTrigger>
            <TabsTrigger value="historial">Historial</TabsTrigger>
          </TabsList>
          <TabsContent value="detalle">Contenido de la pestaña Detalle.</TabsContent>
          <TabsContent value="historial">Contenido de la pestaña Historial.</TabsContent>
        </Tabs>
      </Section>

      <Section title="Diálogo">
        <div>
          <Dialog>
            <DialogTrigger asChild>
              <Button variant="outline">Abrir diálogo</Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Cambiar el estado</DialogTitle>
                <DialogDescription>
                  Un diálogo con título, descripción y acciones al pie.
                </DialogDescription>
              </DialogHeader>
              <DialogFooter>
                <Button>Guardar</Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      </Section>

      <Section title="Encabezado y estados">
        <p className="text-sm text-muted-foreground">
          El encabezado de esta galería es el <code className="font-mono">PageHeader</code>: cada
          pantalla tiene uno solo, y es su único h1.
        </p>
        <div className="grid gap-4 md:grid-cols-3">
          <div className="rounded-xl border p-4">
            <LoadingState label="Cargando tickets…" />
          </div>
          <div className="rounded-xl border p-4">
            <EmptyState
              title="No hay tickets"
              description="Todavía no cargaste ninguno."
              action={<Button variant="outline">Nuevo ticket</Button>}
            />
          </div>
          <div className="rounded-xl border p-4">
            <ErrorState
              title="No se pudo cargar"
              description="Intentá de nuevo en unos segundos."
              onRetry={() => undefined}
            />
          </div>
        </div>
      </Section>
    </Page>
  );
}
