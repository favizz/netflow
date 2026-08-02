import { Card } from "@/components/ui/card"
import { Info, Zap, Droplets } from "lucide-react"

interface TokenConversionInfoProps {
    kwhRate: number
    waterRate: number
}

export default function TokenConversionInfo({ kwhRate, waterRate }: TokenConversionInfoProps) {
    return (
        <div className="space-y-4">
            <Card className="p-4 bg-primary/5 border-primary/20">
                <div className="flex gap-3">
                    <Info className="w-5 h-5 text-primary flex-shrink-0 mt-0.5" />
                    <div className="space-y-1">
                        <p className="text-sm font-semibold text-foreground">Informasi Konversi Token</p>
                        <p className="text-xs text-muted-foreground leading-relaxed">
                            Nilai token yang Anda beli akan dikonversikan ke satuan unit (KWh atau M³) berdasarkan tarif yang berlaku pada saat transaksi.
                        </p>
                    </div>
                </div>
            </Card>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <Card className="p-4 space-y-3">
                    <div className="flex items-center justify-between">
                        <span className="text-sm text-muted-foreground font-medium">Tarif Listrik</span>
                        <Zap size={18} className="text-yellow-500" />
                    </div>
                    <div>
                        <p className="text-2xl font-bold text-foreground">Rp {kwhRate.toLocaleString("en-US")}</p>
                        <p className="text-xs text-muted-foreground">per KWh</p>
                    </div>
                </Card>

                <Card className="p-4 space-y-3">
                    <div className="flex items-center justify-between">
                        <span className="text-sm text-muted-foreground font-medium">Tarif Air</span>
                        <Droplets size={18} className="text-blue-500" />
                    </div>
                    <div>
                        <p className="text-2xl font-bold text-foreground">Rp {waterRate.toLocaleString("en-US")}</p>
                        <p className="text-xs text-muted-foreground">per M³</p>
                    </div>
                </Card>
            </div>

            <Card className="p-6">
                <h3 className="text-sm font-semibold mb-4">Simulasi Konversi</h3>
                <div className="space-y-4">
                    <div className="flex justify-between items-center py-2 border-b text-sm">
                        <span className="text-muted-foreground">Rp 20.000</span>
                        <div className="text-right">
                            <p className="font-medium">≈ {(20000 / kwhRate).toFixed(1)} KWh</p>
                            <p className="text-xs text-muted-foreground">Listrik</p>
                        </div>
                    </div>
                    <div className="flex justify-between items-center py-2 border-b text-sm">
                        <span className="text-muted-foreground">Rp 50.000</span>
                        <div className="text-right">
                            <p className="font-medium">≈ {(50000 / kwhRate).toFixed(1)} KWh</p>
                            <p className="text-xs text-muted-foreground">Listrik</p>
                        </div>
                    </div>
                    <div className="flex justify-between items-center py-2 border-b text-sm">
                        <span className="text-muted-foreground">Rp 100.000</span>
                        <div className="text-right">
                            <p className="font-medium">≈ {(100000 / kwhRate).toFixed(1)} KWh</p>
                            <p className="text-xs text-muted-foreground">Listrik</p>
                        </div>
                    </div>
                </div>
            </Card>
        </div>
    )
}
