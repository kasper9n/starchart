<script lang="ts">
	import { cubicOut } from 'svelte/easing'
	import { fade, fly, scale } from 'svelte/transition'
	import type { Line } from './chart'
	import { hex_colors } from './color'

	export let line: Line
	$: hex = hex_colors[line.color]
	export let screenshot_mode = false
	export let on_delete: () => void
</script>

<!-- svelte-ignore a11y_no_noninteractive_tabindex -->
<!-- svelte-ignore a11y_no_static_element_interactions -->
<div
	class="container"
	class:hidden={line.hidden}
	style:--color-1={hex}
	style:--color-2="color-mix(in srgb, black, var(--color-1) 47%)"
	tabindex="0"
	on:keydown={(e) => {
		if (e.key === ' ' || e.key === 'Enter') {
			line.hidden = !line.hidden
			line.instance.applyOptions({ visible: !line.hidden })
			e.preventDefault()
		} else if (e.key === 'Backspace' || e.key === 'Delete') {
			on_delete()
			e.preventDefault()
		}
	}}
	in:scale={{ duration: 200, easing: cubicOut, start: 0.75, opacity: 0 }}
>
	<!-- Hide when 0 because it may load from cache server -->
	{#if !line.final && line.data.length > 0}
		{@const latest = line.data[line.data.length - 1]}
		<div class="counter-container">
			<div class="counter-bg">
				{latest.v}
			</div>
		</div>
		<div class="counter-container">
			<div class="counter">
				<span class="counter-sizing-text">{latest.v}</span>
				{#key line.data.length}
					<span
						class="counter-text"
						in:fly={{ duration: 300, y: 10 }}
						out:fly={{ duration: 300, y: -10 }}>{latest.v}</span
					>
				{/key}
			</div>
		</div>
	{/if}
	<span class="serie" class:screenshot-mode={screenshot_mode}>
		<button
			type="button"
			class="name"
			tabindex="-1"
			on:click={() => {
				line.hidden = !line.hidden
				line.instance.applyOptions({ visible: !line.hidden })
			}}
		>
			{line.name}
		</button>
		<button type="button" class="x" class:loading={!line.final} on:click={on_delete} tabindex="-1">
			<svg
				fill="currentColor"
				width="18"
				height="18"
				clip-rule="evenodd"
				fill-rule="evenodd"
				stroke-linejoin="round"
				stroke-miterlimit="2"
				viewBox="0 0 24 24"
				xmlns="http://www.w3.org/2000/svg"
				><path
					d="m12 10.93 5.719-5.72c.146-.146.339-.219.531-.219.404 0 .75.324.75.749 0 .193-.073.385-.219.532l-5.72 5.719 5.719 5.719c.147.147.22.339.22.531 0 .427-.349.75-.75.75-.192 0-.385-.073-.531-.219l-5.719-5.719-5.719 5.719c-.146.146-.339.219-.531.219-.401 0-.75-.323-.75-.75 0-.192.073-.384.22-.531l5.719-5.719-5.72-5.719c-.146-.147-.219-.339-.219-.532 0-.425.346-.749.75-.749.192 0 .385.073.531.219z"
				/></svg
			>
			{#if !line.final}
				<div class="spinner" transition:fade={{ duration: 150 }}>
					<div class="circle"></div>
				</div>
			{/if}
		</button>
	</span>
</div>

<style lang="sass">
	.container
		position: relative
		outline: none
	.serie
		border-radius: 8px
		border: 2px solid
		display: inline-flex
		align-items: center
		font-size: 0.9375rem
		font-weight: 500
		transition: 100ms ease-out
		outline: 1px solid transparent
		background-color: var(--color-2)
		border-color: var(--color-1)
		height: 24px
		position: relative
		svg
			display: block
	.container:focus-visible .serie
		border-color: hsla(0, 0%, 100%, 1)
	.counter-container
		position: absolute
		bottom: -0.9375rem
		font-size: 0.75rem
		width: 100%
		display: flex
		justify-content: center
		user-select: none
		overflow: hidden
	.counter-bg, .counter
		padding-bottom: 0.175rem
		padding-right: 0.5rem
		padding-left: 0.5rem
	.counter-bg
		border: 2px solid
		background-color: var(--color-2)
		border-color: var(--color-1)
		border-radius: 8px
		color: transparent
	.container:focus-visible .counter-bg
		border-color: hsla(0, 0%, 100%, 1)
	.counter
		z-index: 1
		background-color: var(--color-2)
		border-bottom-left-radius: 8px
		border-bottom-right-radius: 8px
		margin-bottom: 0.175rem
		padding-bottom: 0rem
		position: relative
		span
			pointer-events: none
		.counter-sizing-text
			color: transparent
		.counter-text
			position: absolute
			top: 0
			left: 0
			width: 100%
	.hidden
		opacity: 0.6
		button
			text-decoration: line-through
		.serie, .counter-bg
			border-style: dashed
	button
		background: none
		border: none
		color: inherit
		padding: 0.175rem 0.5rem
		outline: 1px solid transparent
	button.x
		position: relative
		transition: all 100ms ease-out
		padding-left: 0.1rem
		&:hover
			opacity: 0.7
	.screenshot-mode button.x
		display: none
	:not(.screenshot-mode) .name
		padding-right: 0.2rem
	.screenshot-mode .name
		margin-top: -2px
	.name
		font-size: 0.875rem
		font-weight: 500
		font-family: inherit
		transition: all 50ms ease-out
		padding-top: 0.225rem
		padding-bottom: 0.225rem
		display: flex
		align-items: center
		&:hover
			text-decoration: line-through
	.spinner
		position: absolute
		width: 100%
		height: 100%
		top: 0
		left: 0
		display: flex
		justify-content: center
		align-items: center
		transition: all 150ms ease-out
	svg
		transition: all 150ms ease-out
	button.loading
		svg
			opacity: 0
	.serie:hover
		svg
			opacity: 1
		.spinner
			opacity: 0
	.circle
		height: 11px
		width: 11px
		border-color: white transparent white white
		border-width: 1.5px
		border-style: solid
		border-image: initial
		border-radius: 50%
		animation: 750ms linear 0s infinite normal none running circle-rotate

	@keyframes circle-rotate
		0%
			transform: rotate(0)
		100%
			transform: rotate(360deg)
</style>
