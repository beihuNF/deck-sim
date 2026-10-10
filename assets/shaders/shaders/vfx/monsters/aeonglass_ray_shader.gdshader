shader_type canvas_item;
render_mode blend_mix;

uniform vec4 CoreColor : source_color;
uniform float Progress;
uniform sampler2D RayTex : repeat_disable;
uniform vec4 BlurColor : source_color;
uniform vec2 EdgeMaskScale = vec2(1.000000, 1.000000);
uniform sampler2D EdgeMaskTex : filter_linear, repeat_disable;



void fragment() {
// ColorParameter:16
	vec4 n_out16p0 = CoreColor;


// FloatParameter:9
	float n_out9p0 = Progress;


// VectorCompose:10
	float n_in10p1 = 0.00000;
	vec2 n_out10p0 = vec2(n_out9p0, n_in10p1);


// UVFunc:3
	vec2 n_in3p1 = vec2(1.00000, 1.00000);
	vec2 n_out3p0 = n_out10p0 * n_in3p1 + UV;


	vec4 n_out4p0;
// Texture2D:4
	n_out4p0 = texture(RayTex, n_out3p0);


// VectorDecompose:11
	float n_out11p0 = n_out4p0.x;
	float n_out11p1 = n_out4p0.y;
	float n_out11p2 = n_out4p0.z;
	float n_out11p3 = n_out4p0.w;


// VectorOp:17
	vec3 n_out17p0 = vec3(n_out16p0.xyz) * vec3(n_out11p0);


// ColorParameter:6
	vec4 n_out6p0 = BlurColor;


// VectorOp:8
	vec3 n_out8p0 = vec3(n_out6p0.xyz) * vec3(n_out11p1);


// VectorOp:18
	vec3 n_out18p0 = n_out17p0 + n_out8p0;


// Vector2Parameter:19
	vec2 n_out19p0 = EdgeMaskScale;


// UVFunc:20
	vec2 n_in20p2 = vec2(0.00000, 0.00000);
	vec2 n_out20p0 = (UV - n_in20p2) * n_out19p0 + n_in20p2;


	vec4 n_out14p0;
// Texture2D:14
	n_out14p0 = texture(EdgeMaskTex, n_out20p0);


// VectorDecompose:15
	float n_out15p0 = n_out14p0.x;
	float n_out15p1 = n_out14p0.y;
	float n_out15p2 = n_out14p0.z;
	float n_out15p3 = n_out14p0.w;


// FloatOp:13
	float n_out13p0 = n_out11p1 * n_out15p1;


// Output:0
	COLOR.rgb = n_out18p0;
	COLOR.a = n_out13p0;


}
