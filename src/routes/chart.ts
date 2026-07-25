import {
	AreaSeries,
	createChart as create_chart_instance,
	PriceScaleMode,
	TickMarkType,
	type BusinessDay,
	type ChartOptions,
	type DeepPartial,
	type IChartApi,
	type ISeriesApi,
	type SingleValueData,
	type UTCTimestamp,
} from 'lightweight-charts'
import { writable } from 'svelte/store'
import { bottom_colors, hex_colors, top_colors } from './color'

export type DataPoint = { t: UTCTimestamp; v: number }
type LineBase = {
	name: string
	data: DataPoint[]
	color: number
	/** Loading if absent */
	final?: DataPoint
}
export interface Line extends LineBase {
	instance: ISeriesApi<'Area'>
	deleted: boolean
	lastChartSeriesDate?: BusinessDay
	hidden?: boolean
}

type LineJson = {
	name: string
	/** Star count = index + 1 */
	data: UTCTimestamp[]
	color: number
	/** Loading if absent */
	final?: DataPoint
}

/** Used to invalidate old localStorage */
const json_type_version = 4
type Json = {
	lines: LineJson[]
	align: boolean
	logScale: boolean
	v: number
	expiry: number
}

let next_color_index = 0
export function get_next_color_index() {
	const value = next_color_index
	next_color_index = (next_color_index + 1) % hex_colors.length
	return value
}

function load_json() {
	try {
		const series_local_storage = JSON.parse(localStorage.getItem('starchart-series') || '{}')
		if (
			series_local_storage?.v === json_type_version &&
			series_local_storage?.expiry > Date.now()
		) {
			const json = series_local_storage as Json
			const line_bases = json.lines.map((line): LineBase => ({
				color: line.color,
				data: line.data.map((utc_timestamp, i): DataPoint => {
					return {
						t: utc_timestamp,
						v: i + 1,
					}
				}),
				final: line.final,
				name: line.name,
			}))
			return {
				lines: line_bases,
				align: json.align,
				logScale: json.logScale,
			}
		} else {
			localStorage.removeItem('starchart-series')
		}
	} catch (e) {
		console.log('Could not load lines', e)
	}
	return {
		lines: [],
		align: false,
		logScale: false,
	}
}

type ChartData = {
	instance: IChartApi
	lines: Line[]
	align: boolean
	logScale: boolean
	container: HTMLElement
}
export type Chart = ReturnType<typeof new_chart>

const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

export function new_chart(container: HTMLElement, options: DeepPartial<ChartOptions>) {
	const chart: ChartData = {
		instance: create_chart_instance(container, options),
		container,
		align: false,
		logScale: false,
		lines: [],
	}
	const { subscribe, set } = writable(chart)

	const json = load_json()
	chart.align = json.align

	function set_default_formatting() {
		chart.instance.applyOptions({
			localization: {
				timeFormatter: (time: BusinessDay) => {
					const date = new Date(time.year, time.month - 1, time.day)
					return `${date.getDate()} ${months[date.getMonth()]} ${date.getFullYear()}`
				},
			},
			timeScale: {
				tickMarkFormatter: () => null,
			},
		})
	}
	set_default_formatting()

	function set_aligned_formatting() {
		const start_date = new Date(2001, 0)
		const day = 1000 * 3600 * 24
		const start_day = Math.ceil(start_date.getTime() / day)
		chart.instance.applyOptions({
			localization: {
				timeFormatter: (time: BusinessDay) => {
					const date = new Date(time.year, time.month - 1, time.day)
					return Math.ceil(date.getTime() / day) - start_day + ' days'
				},
			},
			timeScale: {
				tickMarkFormatter: (time: BusinessDay, tick_mark_type: TickMarkType) => {
					const date = new Date(time.year, time.month - 1, time.day)
					if (tick_mark_type === TickMarkType.DayOfMonth) {
						return Math.ceil(date.getTime() / day) - start_day + 'd'
					}
					const years = date.getFullYear() - start_date.getFullYear()
					if (tick_mark_type === TickMarkType.Month) {
						return date.getMonth() - start_date.getMonth() + 12 * years + 'm'
					} else if (tick_mark_type === TickMarkType.Year) {
						switch (years) {
							case 0:
								return '0d'
							case 1:
								return '1y'
							default:
								return years + 'y'
						}
					} else {
						return null
					}
				},
			},
		})
	}
	if (chart.align) {
		set_aligned_formatting()
	} else {
		set_default_formatting()
	}

	const filler_line = chart.instance.addSeries(AreaSeries, {
		priceScaleId: '',
		visible: false,
	})

	function update_filler(data: Line[]) {
		if (chart.align && data.length > 0) {
			filler_line.setData([])
		} else {
			filler_line.setData(get_filler(data, new Date()))
		}
	}

	const store = {
		subscribe,

		addLine(new_line: LineBase) {
			const series = chart.instance.addSeries(AreaSeries, {
				priceLineVisible: false,
				topColor: top_colors[new_line.color],
				bottomColor: bottom_colors[new_line.color],
				lineColor: hex_colors[new_line.color],
				priceFormat: {
					type: 'custom',
					formatter: (price: number) => {
						return Math.round(price)
					},
				},
			})

			const line: Line = {
				...new_line,
				instance: series,
				deleted: false,
			}
			if (new_line.data.length >= 1) {
				let chart_series = to_chart_series(new_line.data, new_line.final)

				if (chart.align) {
					chart_series = align_chart_series(chart_series)
				}
				line.lastChartSeriesDate = chart_series[chart_series.length - 1].time
				series.setData(chart_series)
			}
			chart.lines.push(line)
			if (line.data.length >= 1) {
				update_filler(chart.lines)
				store.resetZoom()
			}
			set(chart)
			return line
		},

		alignLines() {
			chart.align = true
			for (const line of chart.lines) {
				if (line.deleted || line.data.length === 0) {
					continue
				}
				const chart_series = to_chart_series(line.data, line.final)
				const aligned_chart_series = align_chart_series(chart_series)
				line.instance.setData(aligned_chart_series)
				line.lastChartSeriesDate = aligned_chart_series[aligned_chart_series.length - 1].time
			}
			set_aligned_formatting()
			update_filler(chart.lines)
			this.resetZoom()
			set(chart)
		},

		unalignLines() {
			chart.align = false
			for (const line of chart.lines) {
				if (line.deleted || line.data.length === 0) {
					continue
				}
				const chart_series = to_chart_series(line.data, line.final)
				line.instance.setData(chart_series)
				line.lastChartSeriesDate = chart_series[chart_series.length - 1].time
			}
			set_default_formatting()
			this.resetZoom()
			set(chart)
		},

		setLogScale(log_scale: boolean) {
			chart.instance.applyOptions({
				rightPriceScale: {
					mode: log_scale ? PriceScaleMode.Logarithmic : PriceScaleMode.Normal,
				},
			})
			chart.logScale = log_scale
			set(chart)
		},

		deleteLine(line: Line) {
			chart.instance.removeSeries(line.instance)
			line.deleted = true
			chart.lines = chart.lines.filter((line) => !line.deleted)
			set(chart)
		},

		_appendAlignedChartData(line: Line) {
			if (line.data.length === 0) {
				return
			}
			const chart_series = to_chart_series(line.data, line.final)
			const fresh = line.data.length === 0
			if (fresh) {
				const aligned_chart_series = align_chart_series(chart_series)
				line.instance.setData(aligned_chart_series)
				line.lastChartSeriesDate = aligned_chart_series[aligned_chart_series.length - 1].time
			} else {
				const start_day = line.lastChartSeriesDate
				if (!start_day) {
					throw new Error('no lastChartSeriesDate')
				}
				const start_date = new Date(start_day.year, start_day.month - 1, start_day.day)
				const aligned_chart_series = align_chart_series(chart_series, start_date)
				line.lastChartSeriesDate = aligned_chart_series[aligned_chart_series.length - 1].time

				line.instance.setData(aligned_chart_series)
			}
		},

		_appendChartData(line: Line) {
			if (line.data.length === 0) {
				return
			} else if (chart.align) {
				return this._appendAlignedChartData(line)
			}
			const chart_series = to_chart_series(line.data, line.final)
			line.lastChartSeriesDate = chart_series[chart_series.length - 1].time
			const fresh = line.data.length === 0
			if (fresh) {
				line.instance.setData(chart_series)
			} else {
				line.instance.setData(chart_series)
			}
		},

		updateStargazers(line: Line, data: DataPoint[]) {
			const fresh = line.data.length === 0
			line.data = data
			store._appendChartData(line)
			if (fresh) {
				update_filler(chart.lines)
				store.resetZoom()
			}
			set(chart)
		},

		addFinal(line: Line, data: DataPoint) {
			// Don't add it to line.data, that would mess up localStorage.
			// Instead, we add it directly to the chart later
			store._appendChartData(line)
			line.final = data
			update_filler(chart.lines)
			set(chart)
		},

		resetZoom() {
			chart.instance.timeScale().fitContent()
		},

		save() {
			save(chart)
		},
	}

	store.setLogScale(json.logScale)

	for (const json_line of json.lines) {
		store.addLine(json_line)
	}
	if (json.lines[json.lines.length - 1]) {
		const last_color = json.lines[json.lines.length - 1].color
		const last_color_index = hex_colors.findIndex((color) => color === hex_colors[last_color])
		next_color_index = (last_color_index + 1) % hex_colors.length
	}

	return store
}

/** Used to keep the full chart size even when some lines are hidden */
function get_filler(data: Line[], now: Date) {
	let lowest_date = (Date.now() / 1000) as UTCTimestamp
	for (const series of data) {
		const data_point = series.data[0]
		if (data_point && data_point.t < lowest_date) {
			lowest_date = data_point.t
		}
	}
	const dt = new Date(lowest_date * 1000)
	const date = new Date(dt.getFullYear(), dt.getMonth(), dt.getDate())

	const dates = [date]
	while (dates[dates.length - 1] < now) {
		dates.push(
			new Date(
				dates[dates.length - 1].getFullYear(),
				dates[dates.length - 1].getMonth(),
				dates[dates.length - 1].getDate() + 1,
			),
		)
	}
	return dates.map((date) => {
		return {
			time: {
				year: date.getFullYear(),
				month: date.getMonth() + 1,
				day: date.getDate(),
			},
		}
	})
}

const day = 1000 * 60 * 60 * 24
function save(chart: ChartData) {
	if (chart.lines.length === 0) {
		localStorage.removeItem('starchart-series')
		return
	}

	const json_lines = chart.lines.map((line): LineJson => ({
		name: line.name,
		data: line.data.map((data_point) => data_point.t),
		color: line.color,
		final: line.final,
	}))
	const json: Json = {
		lines: json_lines,
		v: json_type_version,
		align: chart.align,
		logScale: chart.logScale,
		expiry: Date.now() + day * 1,
	}
	localStorage.setItem('starchart-series', JSON.stringify(json))
}

type ChartSeries = {
	time: {
		year: number
		month: number
		day: number
	}
	value: number
}
function to_chart_series(data: DataPoint[], final?: DataPoint): ChartSeries[] {
	const data_points: { date: Date; value: number }[] = []
	data.sort((a, b) => a.t - b.t)

	for (let i = 0; i < data.length + Number(!!final); i++) {
		let data_point = data[i]
		if (i === data.length) {
			if (!final) throw new Error('final is undefined')
			data_point = final
		}
		const dt = new Date(data_point.t * 1000)
		const date = new Date(dt.getFullYear(), dt.getMonth(), dt.getDate())

		let last_data_piont = (data_points as Partial<typeof data_points>)[data_points.length - 1]
		if (last_data_piont) {
			while (last_data_piont.date < date) {
				data_points.push({
					date: new Date(
						last_data_piont.date.getFullYear(),
						last_data_piont.date.getMonth(),
						last_data_piont.date.getDate() + 1,
					),
					value: last_data_piont.value,
				})
				last_data_piont = data_points[data_points.length - 1]
			}
		}
		if (last_data_piont && last_data_piont.date.getTime() === date.getTime()) {
			data_points[data_points.length - 1].value = data_point.v
		} else {
			data_points.push({
				date: date,
				value: data_point.v,
			})
		}
	}

	return data_points.map((data_point) => {
		return {
			time: {
				year: data_point.date.getFullYear(),
				month: data_point.date.getMonth() + 1,
				day: data_point.date.getDate(),
			},
			value: data_point.value,
		} satisfies SingleValueData
	})
}

function align_chart_series(chart_series: ChartSeries[], start = new Date(2001, 0)): ChartSeries[] {
	const date = start
	return chart_series.map((series_point): ChartSeries => {
		const aligned_series_point: ChartSeries = {
			time: {
				day: date.getDate(),
				month: date.getMonth() + 1,
				year: date.getFullYear(),
			},
			value: series_point.value,
		}
		date.setDate(date.getDate() + 1)
		return aligned_series_point
	})
}
