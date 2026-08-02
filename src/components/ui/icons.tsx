import { forwardRef, type ComponentPropsWithoutRef } from "react";
import { MorphIcon as MorphIconPrimitive, type IconInput } from "morphicons/react";
import {
  AlertTriangle as AlertTriangleData,
  ArrowDown as ArrowDownData,
  ArrowDownWideNarrow as ArrowDownWideNarrowData,
  ArrowLeft as ArrowLeftData,
  ArrowUp as ArrowUpData,
  ArrowUpNarrowWide as ArrowUpNarrowWideData,
  Calendar as CalendarData,
  Check as CheckData,
  ChevronDown as ChevronDownData,
  ChevronLeft as ChevronLeftData,
  ChevronRight as ChevronRightData,
  ChevronUp as ChevronUpData,
  CircleDollarSign as CircleDollarSignData,
  CircuitBoard as CircuitBoardData,
  Clock3 as Clock3Data,
  Copy as CopyData,
  Cpu as CpuData,
  Database as DatabaseData,
  Eye as EyeData,
  EyeOff as EyeOffData,
  Gauge as GaugeData,
  Globe as GlobeData,
  Grid3x3 as Grid3x3Data,
  HardDrive as HardDriveData,
  History as HistoryData,
  House as HouseData,
  LayoutGrid as LayoutGridData,
  LayoutTemplate as LayoutTemplateData,
  List as ListData,
  ListFilter as ListFilterData,
  Lock as LockData,
  LogIn as LogInData,
  MemoryStick as MemoryStickData,
  Monitor as MonitorData,
  Moon as MoonData,
  Network as NetworkData,
  Palette as PaletteData,
  RefreshCw as RefreshCwData,
  RotateCcw as RotateCcwData,
  Rows3 as Rows3Data,
  Save as SaveData,
  Search as SearchData,
  Settings as SettingsData,
  SlidersHorizontal as SlidersHorizontalData,
  Sun as SunData,
  SunMoon as SunMoonData,
  Thermometer as ThermometerData,
  Unplug as UnplugData,
  Wallpaper as WallpaperData,
  Workflow as WorkflowData,
  X as XData,
  Zap as ZapData,
} from "lucide";

export type IconProps = Omit<ComponentPropsWithoutRef<typeof MorphIconPrimitive>, "icon">;

/**
 * Adapts Lucide's geometry data to morphicons while preserving the familiar
 * icon-component API used throughout the theme. All icons therefore share one
 * renderer, reduced-motion behavior, and stroke treatment.
 */
function createIcon(icon: IconInput, name: string) {
  const Icon = forwardRef<SVGSVGElement, IconProps>(function ThemeMorphIcon(props, ref) {
    return <MorphIconPrimitive {...props} ref={ref as never} icon={icon} />;
  });
  Icon.displayName = name;
  return Icon;
}

export const MorphIcon = forwardRef<SVGSVGElement, ComponentPropsWithoutRef<typeof MorphIconPrimitive>>(
  function ThemeMorphIcon({ spring, className, ...props }, ref) {
    return (
      <MorphIconPrimitive
        {...props}
        className={className}
        ref={ref as never}
        spring={spring}
      />
    );
  },
);
export const iconData = {
  AlertTriangle: AlertTriangleData,
  ArrowDown: ArrowDownData,
  ArrowDownWideNarrow: ArrowDownWideNarrowData,
  ArrowLeft: ArrowLeftData,
  ArrowUp: ArrowUpData,
  ArrowUpNarrowWide: ArrowUpNarrowWideData,
  Calendar: CalendarData,
  Check: CheckData,
  ChevronDown: ChevronDownData,
  ChevronLeft: ChevronLeftData,
  ChevronRight: ChevronRightData,
  ChevronUp: ChevronUpData,
  CircleDollarSign: CircleDollarSignData,
  CircuitBoard: CircuitBoardData,
  Clock3: Clock3Data,
  Copy: CopyData,
  Cpu: CpuData,
  Database: DatabaseData,
  Eye: EyeData,
  EyeOff: EyeOffData,
  Gauge: GaugeData,
  Globe: GlobeData,
  Grid3x3: Grid3x3Data,
  HardDrive: HardDriveData,
  History: HistoryData,
  House: HouseData,
  LayoutGrid: LayoutGridData,
  LayoutTemplate: LayoutTemplateData,
  List: ListData,
  ListFilter: ListFilterData,
  Lock: LockData,
  LogIn: LogInData,
  MemoryStick: MemoryStickData,
  Monitor: MonitorData,
  Moon: MoonData,
  Network: NetworkData,
  Palette: PaletteData,
  RefreshCw: RefreshCwData,
  RotateCcw: RotateCcwData,
  Rows3: Rows3Data,
  Save: SaveData,
  Search: SearchData,
  Settings: SettingsData,
  SlidersHorizontal: SlidersHorizontalData,
  Sun: SunData,
  SunMoon: SunMoonData,
  Thermometer: ThermometerData,
  Unplug: UnplugData,
  Wallpaper: WallpaperData,
  Workflow: WorkflowData,
  X: XData,
  Zap: ZapData,
} satisfies Record<string, IconInput>;

export const AlertTriangle = createIcon(iconData.AlertTriangle, "AlertTriangle");
export const ArrowDown = createIcon(iconData.ArrowDown, "ArrowDown");
export const ArrowLeft = createIcon(iconData.ArrowLeft, "ArrowLeft");
export const ArrowUp = createIcon(iconData.ArrowUp, "ArrowUp");
export const Calendar = createIcon(iconData.Calendar, "Calendar");
export const Check = createIcon(iconData.Check, "Check");
export const ChevronDown = createIcon(iconData.ChevronDown, "ChevronDown");
export const ChevronLeft = createIcon(iconData.ChevronLeft, "ChevronLeft");
export const ChevronUp = createIcon(iconData.ChevronUp, "ChevronUp");
export const CircleDollarSign = createIcon(iconData.CircleDollarSign, "CircleDollarSign");
export const CircuitBoard = createIcon(iconData.CircuitBoard, "CircuitBoard");
export const Clock3 = createIcon(iconData.Clock3, "Clock3");
export const Copy = createIcon(iconData.Copy, "Copy");
export const Cpu = createIcon(iconData.Cpu, "Cpu");
export const Database = createIcon(iconData.Database, "Database");
export const EyeOff = createIcon(iconData.EyeOff, "EyeOff");
export const Gauge = createIcon(iconData.Gauge, "Gauge");
export const Globe = createIcon(iconData.Globe, "Globe");
export const Grid3x3 = createIcon(iconData.Grid3x3, "Grid3x3");
export const HardDrive = createIcon(iconData.HardDrive, "HardDrive");
export const History = createIcon(iconData.History, "History");
export const House = createIcon(iconData.House, "House");
export const LayoutGrid = createIcon(iconData.LayoutGrid, "LayoutGrid");
export const LayoutTemplate = createIcon(iconData.LayoutTemplate, "LayoutTemplate");
export const List = createIcon(iconData.List, "List");
export const ListFilter = createIcon(iconData.ListFilter, "ListFilter");
export const Lock = createIcon(iconData.Lock, "Lock");
export const LogIn = createIcon(iconData.LogIn, "LogIn");
export const MemoryStick = createIcon(iconData.MemoryStick, "MemoryStick");
export const Network = createIcon(iconData.Network, "Network");
export const Palette = createIcon(iconData.Palette, "Palette");
export const RefreshCw = createIcon(iconData.RefreshCw, "RefreshCw");
export const RotateCcw = createIcon(iconData.RotateCcw, "RotateCcw");
export const Rows3 = createIcon(iconData.Rows3, "Rows3");
export const Save = createIcon(iconData.Save, "Save");
export const Search = createIcon(iconData.Search, "Search");
export const Settings = createIcon(iconData.Settings, "Settings");
export const SlidersHorizontal = createIcon(iconData.SlidersHorizontal, "SlidersHorizontal");
export const Thermometer = createIcon(iconData.Thermometer, "Thermometer");
export const Unplug = createIcon(iconData.Unplug, "Unplug");
export const Wallpaper = createIcon(iconData.Wallpaper, "Wallpaper");
export const Workflow = createIcon(iconData.Workflow, "Workflow");
export const X = createIcon(iconData.X, "X");
export const Zap = createIcon(iconData.Zap, "Zap");
