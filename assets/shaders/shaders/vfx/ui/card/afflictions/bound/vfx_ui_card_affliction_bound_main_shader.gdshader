shader_type canvas_item;
render_mode blend_mix;

vec2 tiling_and_offset(vec2 base_uv, vec4 st, vec2 initial_offset) {
	return (
		(base_uv * st.xy) +
		((st.zw * TIME) + initial_offset)
		);
}

uniform vec4 bright_st;
uniform float bright_energy;

varying vec4 vertex_color;

void vertex() {
	vertex_color = COLOR;
}

void fragment() {
	vec4 bright_tex = texture(TEXTURE, tiling_and_offset(UV, bright_st, vec2(0.0)));
	vec4 main_tex = texture(TEXTURE, UV);

	float energy_multiplier = mix(1.0, bright_energy, bright_tex.g);

	COLOR = vec4((main_tex.rrr * vertex_color.rgb * energy_multiplier).rgb, main_tex.a * vertex_color.a);
}
